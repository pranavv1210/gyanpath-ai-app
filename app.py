import os
import logging
import json # <<< NEW: For handling JSON strings in DB
from datetime import timedelta, datetime # <<< NEW: For OTP expiration
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from neo4j import GraphDatabase, basic_auth
from werkzeug.security import generate_password_hash, check_password_hash
import spacy
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
import requests
from bs4 import BeautifulSoup

# For OTP generation
import random # <<< NEW
import string # <<< NEW

# For sending emails
from flask_mail import Mail, Message # <<< NEW

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# --- Flask-Mail Configuration for sending emails ---
# You will need to set these environment variables in your .env file
# Example for Gmail (less secure app access must be on, or use app password):
# MAIL_SERVER='smtp.gmail.com'
# MAIL_PORT=587
# MAIL_USE_TLS=True
# MAIL_USERNAME='your_email@gmail.com'
# MAIL_PASSWORD='your_email_app_password'
# MAIL_DEFAULT_SENDER='your_email@gmail.com'
# Or for other services like SendGrid (use their SMTP details and API Key as password)
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'True').lower() in ['true', '1', 't']
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')

mail = Mail(app) # <<< NEW: Initialize Flask-Mail

# --- CORS Configuration ---
from flask_cors import CORS # This was missing in your last app.py
CORS(app)


# --- JWT Configuration ---
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
jwt = JWTManager(app)

# --- PostgreSQL Configuration ---
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Neo4j Configuration ---
neo4j_uri = os.getenv("NEO4J_URI")
neo4j_username = os.getenv("NEO4J_USERNAME")
neo4j_password = os.getenv("NEO4J_PASSWORD")

neo4j_driver = None
try:
    neo4j_driver = GraphDatabase.driver(
        neo4j_uri,
        auth=basic_auth(neo4j_username, neo4j_password),
        max_connection_lifetime=60 * 5
    )
    neo4j_driver.verify_connectivity()
    logger.info("Successfully connected to Neo4j.")
except Exception as e:
    logger.error(f"Failed to connect to Neo4j: {e}")

# --- NLP Model Loading ---
nlp = None
try:
    nlp = spacy.load("en_core_web_sm")
    logger.info("Successfully loaded spaCy model 'en_core_web_sm'.")
except Exception as e:
    logger.error(f"Failed to load spaCy model: {e}. Please run 'python -m spacy download en_core_web_sm'")

# --- Define Your Database Models (PostgreSQL) ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=True) # <<< NEW
    last_name = db.Column(db.String(100), nullable=True) # <<< NEW
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    preferred_content_types = db.Column(db.String(255), default='["article", "video"]') # Stored as JSON string
    time_availability = db.Column(db.String(50), default='1_hour_day')
    difficulty_preference = db.Column(db.String(50), default='beginner')

    def __repr__(self):
        return f'<User {self.email}>'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# <<< NEW: OTP Model for temporary storage
class OTP(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False) # One OTP per email at a time
    code = db.Column(db.String(6), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def __repr__(self):
        return f'<OTP for {self.email}>'
# >>> END NEW OTP MODEL


class Resource(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(500), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    resource_type = db.Column(db.String(50), nullable=False)
    source = db.Column(db.String(100), nullable=True)
    difficulty = db.Column(db.String(50), nullable=True)
    estimated_time_minutes = db.Column(db.Integer, nullable=True)
    
    contributed_by_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    contributed_by = db.relationship('User', backref='contributed_resources') 

    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())

    def __repr__(self):
        return f'<Resource {self.title}>'

# --- Helper Function for Neo4j Knowledge Graph ---
def process_resource_for_kg(resource_id, title, description, url):
    if not neo4j_driver:
        logger.warning(f"Neo4j driver not available. Skipping KG processing for resource {resource_id}.")
        return

    if not nlp:
        logger.warning(f"spaCy NLP model not loaded. Skipping KG processing for resource {resource_id}.")
        return

    text_to_process = f"{title}. {description if description else ''}"
    doc = nlp(text_to_process)

    extracted_concepts = set()
    for ent in doc.ents:
        extracted_concepts.add(ent.text)
    for chunk in doc.noun_chunks:
        if len(chunk.text.split()) > 1 or (len(chunk.text.split()) == 1 and len(chunk.text) > 3):
             extracted_concepts.add(chunk.text)

    concepts_list = list(set([concept.strip() for concept in extracted_concepts if concept.strip()]))

    try:
        with neo4j_driver.session() as session:
            session.run(
                "MERGE (r:Resource {resource_id: $resource_id}) "
                "ON CREATE SET r.title = $title, r.url = $url, r.createdAt = timestamp() "
                "ON MATCH SET r.title = $title, r.url = $url",
                resource_id=resource_id, title=title, url=url
            )

            for concept_name in concepts_list:
                session.run(
                    "MERGE (c:Concept {name: $concept_name}) "
                    "ON CREATE SET c.createdAt = timestamp()",
                    concept_name=concept_name
                )
                session.run(
                    "MATCH (r:Resource {resource_id: $resource_id}) "
                    "MATCH (c:Concept {name: $concept_name}) "
                    "MERGE (r)-[:TEACHES]->(c)",
                    resource_id=resource_id, concept_name=concept_name
                )
            logger.info(f"Knowledge Graph updated for resource {resource_id} with concepts: {concepts_list}")

    except Exception as e:
        logger.error(f"Error updating Knowledge Graph for resource {resource_id}: {e}")


# --- Flask Routes (API Endpoints) ---

@app.route('/')
def hello_world():
    return jsonify(message="Welcome to GyanPath.ai Backend!") # <<< RENAMED

@app.route('/test-ai')
def test_ai():
    return jsonify(message="AI functionality placeholder - ready to integrate!")

# <<< MODIFIED: create_user now expects OTP to be pre-verified
@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()
    required_fields = ['first_name', 'last_name', 'email', 'password']
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({"error": "Missing required fields: first_name, last_name, email, password"}), 400

    # Ensure email is lowercase for uniqueness check
    email = data['email'].lower()

    # Check if user already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({"error": "User with this email already exists"}), 409 # 409 Conflict
    
    # Check if OTP is verified for this email
    # For now, let's assume OTP verification would happen in a preceding step
    # and a flag or temporary store would confirm this email is ready for registration.
    # We'll build the OTP verification steps next.
    # For initial testing, we'll bypass OTP check for now, but will add it back.
    # This endpoint will eventually ONLY be called AFTER OTP is verified.

    new_user = User(
        first_name=data['first_name'], # <<< NEW
        last_name=data['last_name'],   # <<< NEW
        email=email
    )
    new_user.set_password(data['password'])
    
    # Set default preferences for new user
    new_user.preferred_content_types = json.dumps(["article", "video"]) # Ensure it's a JSON string
    new_user.time_availability = '1_hour_day'
    new_user.difficulty_preference = 'beginner'

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": f"User {new_user.first_name} {new_user.last_name} ({new_user.email}) created successfully with ID {new_user.id}"}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating user: {e}")
        return jsonify({"error": "Failed to create user", "details": str(e)}), 500
# >>> END MODIFIED create_user


@app.route('/login', methods=['POST'])
def login_user():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    
    # Ensure email is lowercase for lookup
    email = email.lower()

    user = User.query.filter_by(email=email).first()

    if user is None or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    
    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, user_id=user.id, email=user.email), 200

# <<< NEW: Get User Profile (including preferences)
@app.route('/users/<int:user_id>/profile', methods=['GET'])
@jwt_required()
def get_user_profile(user_id):
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"error": "Unauthorized: Cannot view another user's profile"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "id": user.id,
        "first_name": user.first_name, # <<< NEW
        "last_name": user.last_name,   # <<< NEW
        "email": user.email,
        "preferred_content_types": user.preferred_content_types,
        "time_availability": user.time_availability,
        "difficulty_preference": user.difficulty_preference
    }), 200
# >>> END NEW


# <<< NEW: Update User Profile (for preferences and possibly name)
@app.route('/users/<int:user_id>/profile', methods=['PUT'])
@jwt_required()
def update_user_profile(user_id):
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"error": "Unauthorized: Cannot update another user's profile"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()

    # Update basic profile info (optional)
    if 'first_name' in data:
        user.first_name = data['first_name']
    if 'last_name' in data:
        user.last_name = data['last_name']
    
    # Update preferences
    if 'preferred_content_types' in data:
        # Ensure it's stored as a JSON string
        user.preferred_content_types = json.dumps(data['preferred_content_types'])
    if 'time_availability' in data:
        user.time_availability = data['time_availability']
    if 'difficulty_preference' in data:
        user.difficulty_preference = data['difficulty_preference']

    try:
        db.session.commit()
        return jsonify({"message": "Profile updated successfully!"}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating profile for user {user_id}: {e}")
        return jsonify({"error": "Failed to update profile", "details": str(e)}), 500
# >>> END NEW

# <<< NEW: Change Password Endpoint
@app.route('/users/<int:user_id>/change_password', methods=['PUT'])
@jwt_required()
def change_user_password(user_id):
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"error": "Unauthorized: Cannot change another user's password"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not old_password or not new_password:
        return jsonify({"error": "Old password and new password are required"}), 400
    
    if not user.check_password(old_password):
        return jsonify({"error": "Incorrect old password"}), 401 # Unauthorized
    
    user.set_password(new_password)
    try:
        db.session.commit()
        return jsonify({"message": "Password changed successfully!"}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error changing password for user {user_id}: {e}")
        return jsonify({"error": "Failed to change password", "details": str(e)}), 500
# >>> END NEW


# <<< NEW: Request OTP Endpoint
@app.route('/request_otp', methods=['POST'])
def request_otp():
    data = request.get_json()
    email = data.get('email', '').lower() # Convert to lowercase
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    # Check if email is already registered
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email is already registered. Please login or reset password."}), 409 # Conflict

    # Generate a 6-digit OTP
    otp_code = ''.join(random.choices(string.digits, k=6))
    
    # Store OTP with expiration (e.g., 5 minutes from now)
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    
    # Check if an OTP already exists for this email and update it
    existing_otp = OTP.query.filter_by(email=email).first()
    if existing_otp:
        existing_otp.code = otp_code
        existing_otp.expires_at = expires_at
    else:
        new_otp = OTP(email=email, code=otp_code, expires_at=expires_at)
        db.session.add(new_otp)
    
    try:
        db.session.commit()
        
        # Send OTP via email
        msg = Message("Your GyanPath.ai OTP", recipients=[email]) # <<< RENAMED
        msg.body = f"Your One-Time Password (OTP) for GyanPath.ai registration is: {otp_code}\n\nThis OTP is valid for 5 minutes." # <<< RENAMED
        mail.send(msg)
        
        logger.info(f"OTP sent to {email}: {otp_code}")
        return jsonify({"message": "OTP sent to your email. Please check your inbox (and spam folder)."}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to send OTP to {email}: {e}")
        return jsonify({"error": "Failed to send OTP. Please try again later.", "details": str(e)}), 500
# >>> END NEW REQUEST OTP


# <<< NEW: Verify OTP Endpoint
@app.route('/verify_otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email', '').lower()
    otp_code = data.get('otp_code')

    if not email or not otp_code:
        return jsonify({"error": "Email and OTP code are required"}), 400
    
    otp_record = OTP.query.filter_by(email=email, code=otp_code).first()

    if not otp_record:
        return jsonify({"error": "Invalid OTP or email."}), 400
    
    if datetime.utcnow() > otp_record.expires_at:
        db.session.delete(otp_record) # Delete expired OTP
        db.session.commit()
        return jsonify({"error": "OTP has expired. Please request a new one."}), 400
    
    # OTP is valid and not expired, delete it to prevent reuse
    db.session.delete(otp_record)
    db.session.commit()
    
    # In a real system, you might store this email as 'verified' in a temporary cache
    # For now, we'll allow create_user immediately after a successful verify.
    # The frontend will be responsible for proceeding to create_user right after verify_otp success.
    return jsonify({"message": "OTP verified successfully! You can now proceed to register."}), 200
# >>> END NEW VERIFY OTP


@app.route('/users', methods=['GET'])
def get_users():
    users = User.query.all()
    users_list = [{"id": user.id, "email": user.email, "first_name": user.first_name, "last_name": user.last_name} for user in users] # <<< MODIFIED
    return jsonify(users_list)

@app.route('/resources', methods=['POST'])
def add_resource():
    data = request.get_json()
    required_fields = ['title', 'url', 'resource_type']
    
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({"error": "Missing required fields: title, url, resource_type"}), 400

    contributed_by_user_id = data.get('contributed_by_user_id')
    if contributed_by_user_id:
        user_exists = User.query.get(contributed_by_user_id)
        if not user_exists:
            return jsonify({"error": "contributed_by_user_id does not exist"}), 400


    existing_resource = Resource.query.filter_by(url=data['url']).first()
    if existing_resource:
        return jsonify({"message": "Resource with this URL already exists, skipping fetch and re-adding."}), 200

    new_resource = Resource(
        title=data['title'],
        url=data['url'],
        description=data.get('description'),
        resource_type=data.get('resource_type', 'article'),
        source=data.get('source'),
        difficulty=data.get('difficulty'),
        estimated_time_minutes=data.get('estimated_time_minutes'),
        contributed_by_user_id=contributed_by_user_id
    )

    try:
        db.session.add(new_resource)
        db.session.commit()

        if nlp and neo4j_driver:
            process_resource_for_kg(new_resource.id, new_resource.title, new_resource.description, new_resource.url)
        else:
            logger.warning(f"Skipping KG processing for resource {new_resource.id} due to missing NLP or Neo4j connection.")

        return jsonify({
            "message": "Resource added successfully!",
            "resource_id": new_resource.id,
            "title": new_resource.title,
            "url": new_resource.url
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding resource: {e}")
        return jsonify({"error": "Failed to add resource", "details": str(e)}), 500

@app.route('/resources', methods=['GET'])
def get_resources():
    try:
        resources = Resource.query.all()
        resources_list = []
        for resource in resources:
            resource_data = {
                "id": resource.id,
                "title": resource.title,
                "url": resource.url,
                "description": resource.description,
                "resource_type": resource.resource_type,
                "source": resource.source,
                "difficulty": resource.difficulty,
                "estimated_time_minutes": resource.estimated_time_minutes,
                "contributed_by_user_id": resource.contributed_by_user_id,
                "created_at": resource.created_at.isoformat(),
                "updated_at": resource.updated_at.isoformat()
            }
            resources_list.append(resource_data)
        return jsonify(resources_list), 200
    except Exception as e:
        logger.error(f"Error retrieving resources: {e}")
        return jsonify({"error": "Failed to retrieve resources", "details": str(e)}), 500

@app.route('/add_concept', methods=['POST'])
def add_concept():
    if not neo4j_driver:
        return jsonify({"error": "Neo4j connection not available"}), 500

    data = request.get_json()
    concept_name = data.get('name')
    if not concept_name:
        return jsonify({"error": "Concept 'name' is required"}), 400

    try:
        with neo4j_driver.session() as session:
            query = (
                "MERGE (c:Concept {name: $name}) "
                "ON CREATE SET c.createdAt = timestamp() "
                "RETURN c"
            )
            result = session.run(query, name=concept_name)
            record = result.single()
            return jsonify({"message": f"Concept '{record['c']['name']}' added/found in Neo4j."}), 201
    except Exception as e:
        logger.error(f"Error adding concept via endpoint: {e}")
        return jsonify({"error": "Failed to add concept to Neo4j", "details": str(e)}), 500

@app.route('/concepts/relate', methods=['POST'])
def relate_concepts():
    if not neo4j_driver:
        return jsonify({"error": "Neo4j connection not available"}), 500

    data = request.get_json()
    source_concept_name = data.get('source_concept')
    target_concept_name = data.get('target_concept')
    relationship_type = data.get('relationship_type')

    if not all([source_concept_name, target_concept_name, relationship_type]):
        return jsonify({"error": "Missing required fields: source_concept, target_concept, relationship_type"}), 400

    try:
        with neo4j_driver.session() as session:
            session.run("MERGE (c1:Concept {name: $source_name})", source_name=source_concept_name)
            session.run("MERGE (c2:Concept {name: $target_name})", target_name=target_concept_name)

            query = (
                f"MATCH (c1:Concept {{name: $source_name}}) "
                f"MATCH (c2:Concept {{name: $target_name}}) "
                f"MERGE (c1)-[r:{relationship_type}]->(c2) "
                f"ON CREATE SET r.createdAt = timestamp() "
                f"RETURN c1.name, type(r), c2.name"
            )
            result = session.run(query, source_name=source_concept_name, target_name=target_concept_name)
            record = result.single()

            return jsonify({
                "message": f"Relationship '{record[1]}' created between '{record[0]}' and '{record[2]}'.",
                "source_concept": record[0],
                "relationship_type": record[1],
                "target_concept": record[2]
            }), 201
    except Exception as e:
        logger.error(f"Error creating concept relationship: {e}")
        return jsonify({"error": "Failed to create concept relationship", "details": str(e)}), 500

@app.route('/users/<int:user_id>/knowledge', methods=['POST'])
@jwt_required()
def update_user_knowledge(user_id):
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"error": "Unauthorized: Cannot update another user's knowledge"}), 403

    if not neo4j_driver:
        return jsonify({"error": "Neo4j connection not available"}), 500

    user_exists_pg = User.query.get(user_id)
    if not user_exists_pg:
        return jsonify({"error": "User not found in PostgreSQL"}), 404

    data = request.get_json()
    concept_name = data.get('concept_name')
    level = data.get('level')

    if not concept_name or level is None:
        return jsonify({"error": "Missing required fields: concept_name, level"}), 400
    
    if not isinstance(level, (int, float)) or not (0 <= level <= 5):
        return jsonify({"error": "Level must be a number between 0 and 5"}), 400

    try:
        with neo4j_driver.session() as session:
            session.run("MERGE (c:Concept {name: $concept_name})", concept_name=concept_name)

            session.run(
                "MERGE (lp:LearnerProfile {user_id: $user_id}) "
                "ON CREATE SET lp.createdAt = timestamp()",
                user_id=user_id
            )

            query = (
                "MATCH (lp:LearnerProfile {user_id: $user_id}) "
                "MATCH (c:Concept {name: $concept_name}) "
                "MERGE (lp)-[k:KNOWS_LEVEL]->(c) "
                "SET k.level = $level, k.updatedAt = timestamp() "
                "RETURN lp.user_id, c.name, k.level"
            )
            result = session.run(query, user_id=user_id, concept_name=concept_name, level=level)
            record = result.single()

            return jsonify({
                "message": f"User {record[0]}'s knowledge for '{record[1]}' updated to level {record[2]}.",
                "user_id": record[0],
                "concept": record[1],
                "level": record[2]
            }), 200
    except Exception as e:
        logger.error(f"Error updating user knowledge: {e}")
        return jsonify({"error": "Failed to update user knowledge", "details": str(e)}), 500

@app.route('/users/<int:user_id>/learning_path', methods=['GET'])
@jwt_required()
def generate_learning_path(user_id):
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"error": "Unauthorized: Cannot generate path for another user"}), 403

    if not neo4j_driver:
        return jsonify({"error": "Neo4j connection not available"}), 500
    
    target_concept = request.args.get('target_concept')
    if not target_concept:
        return jsonify({"error": "target_concept query parameter is required"}), 400

    user_exists_pg = User.query.get(user_id)
    if not user_exists_pg:
        return jsonify({"error": "User not found in PostgreSQL"}), 404

    try:
        with neo4j_driver.session() as session:
            user_known_concepts_query = session.run(
                "MATCH (lp:LearnerProfile {user_id: $user_id})-[k:KNOWS_LEVEL]->(c:Concept) "
                "RETURN c.name AS concept_name, k.level AS level",
                user_id=user_id
            )
            user_known_concepts = {r["concept_name"]: r["level"] for r in user_known_concepts_query}
            logger.info(f"User {user_id} known concepts: {user_known_concepts}")

            recommended_path = []
            
            unmet_prerequisites_query = session.run(
                f"""
                MATCH (target:Concept {{name: $target_concept}})
                OPTIONAL MATCH (target)<-[:PREREQUISITE_FOR]-(prereq:Concept)
                WHERE NOT EXISTS {{
                    MATCH (lp:LearnerProfile {{user_id: $user_id}})-[k:KNOWS_LEVEL]->(prereq)
                    WHERE k.level >= 3
                }}
                RETURN prereq.name AS unmet_prereq_name
                """,
                user_id=user_id, target_concept=target_concept
            )
            unmet_prerequisites = [r["unmet_prereq_name"] for r in unmet_prerequisites_query if r["unmet_prereq_name"] is not None]
            
            concepts_to_teach = []
            if unmet_prerequisites:
                concepts_to_teach = unmet_prerequisites
                logger.info(f"Unmet prerequisites for {target_concept}: {unmet_prerequisites}")
            else:
                concepts_to_teach.append(target_concept)
                logger.info(f"No unmet prerequisites. Suggesting resources for {target_concept}.")


            for concept in concepts_to_teach:
                resources_for_concept_query = session.run(
                    f"""
                    MATCH (c:Concept {{name: $concept_name}})<-[:TEACHES]-(r:Resource)
                    RETURN r.resource_id AS id, r.title AS title, r.url AS url, r.resource_type AS resource_type,
                           r.source AS source, r.difficulty AS difficulty, r.estimated_time_minutes AS estimated_time_minutes
                    LIMIT 3
                    """,
                    concept_name=concept
                )
                resources_data = []
                for r in resources_for_concept_query:
                    resource_dict = dict(r)
                    resource_dict['id'] = int(resource_dict['id'])
                    resources_data.append(resource_dict)

                if resources_data:
                    recommended_path.append({
                        "concept": concept,
                        "resources": resources_data
                    })
            
            if not recommended_path:
                return jsonify({"message": f"No learning path resources found for '{target_concept}' based on your knowledge or available resources."}), 200

            return jsonify({
                "message": f"Personalized learning path for '{target_concept}' generated.",
                "user_id": user_id,
                "target_concept": target_concept,
                "path": recommended_path
            }), 200

    except Exception as e:
        logger.error(f"Error generating learning path: {e}")
        return jsonify({"error": "Failed to generate learning path", "details": str(e)}), 500

@app.route('/fetch_and_add_resource', methods=['POST'])
@jwt_required()
def fetch_and_add_resource():
    data = request.get_json()
    url_to_fetch = data.get('url')
    contributed_by_user_id_str = get_jwt_identity()
    contributed_by_user_id = int(contributed_by_user_id_str)

    if not url_to_fetch:
        return jsonify({"error": "URL is required"}), 400

    existing_resource = Resource.query.filter_by(url=url_to_fetch).first()
    if existing_resource:
        return jsonify({"message": "Resource with this URL already exists, skipping fetch and re-adding."}), 200

    if not (url_to_fetch.startswith('http://') or url_to_fetch.startswith('https://')):
        return jsonify({"error": "Invalid URL format. Must start with http:// or https://"}), 400

    try:
        response = requests.get(url_to_fetch, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        title = soup.title.string if soup.title else 'No Title Found'
        
        description = ''
        meta_description = soup.find('meta', attrs={'name': 'description'})
        if meta_description:
            description = meta_description.get('content', '')
        else:
            first_p = soup.find('p')
            if first_p:
                description = first_p.get_text(strip=True)[:500]

        resource_type = 'article'
        source = requests.utils.urlparse(url_to_fetch).hostname
        if 'youtube.com' in url_to_fetch or 'youtu.be' in url_to_fetch: # More robust YouTube check
            resource_type = 'video'
            source = 'YouTube'
        elif 'github.com' in url_to_fetch:
            resource_type = 'project'
            source = 'GitHub'

        new_resource = Resource(
            title=title if title else url_to_fetch,
            url=url_to_fetch,
            description=description,
            resource_type=resource_type,
            source=source,
            difficulty='unknown',
            estimated_time_minutes=0,
            contributed_by_user_id=contributed_by_user_id
        )

        db.session.add(new_resource)
        db.session.commit()

        if nlp and neo4j_driver:
            process_resource_for_kg(new_resource.id, new_resource.title, new_resource.description, new_resource.url)
        else:
            logger.warning(f"Skipping KG processing for auto-fetched resource {new_resource.id} due to missing NLP or Neo4j connection.")

        return jsonify({
            "message": "Resource fetched and added successfully!",
            "resource_id": new_resource.id,
            "title": new_resource.title,
            "url": new_resource.url
        }), 201
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP/Network error fetching resource {url_to_fetch}: {e}")
        return jsonify({"error": f"Failed to fetch URL: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unexpected error adding fetched resource {url_to_fetch}: {e}")
        return jsonify({"error": "An unexpected error occurred while adding the resource.", "details": str(e)}), 500

# --- Main Application Entry Point ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        logger.info("PostgreSQL tables created/checked.")
    app.run(debug=True, port=5000)

@app.teardown_appcontext
def close_neo4j_driver(exception):
    if neo4j_driver:
        neo4j_driver.close()
        logger.info("Neo4j driver closed.")