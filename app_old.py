import os
import logging
import json
from datetime import timedelta, datetime
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
import random
import string

# For sending emails
from flask_mail import Mail, Message

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# --- Flask-Mail Configuration for sending emails ---
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'True').lower() in ['true', '1', 't']
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')
mail = Mail(app)

# --- CORS Configuration ---
from flask_cors import CORS 
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

# --- In-memory cache for verified emails (for registration) ---
verified_emails_for_registration = set()
VERIFICATION_TIMEOUT = timedelta(minutes=15)

# --- Define Your Database Models (PostgreSQL) ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    preferred_content_types = db.Column(db.String(255), default='["article", "video"]') # Stored as JSON string
    time_availability = db.Column(db.String(50), default='1_hour_day') # e.g., '30_mins_day', '1_hour_day'
    difficulty_preference = db.Column(db.String(50), default='beginner') # e.g., 'beginner', 'intermediate', 'advanced'

    def __repr__(self):
        return f'<User {self.email}>'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class OTP(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    code = db.Column(db.String(6), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def __repr__(self):
        return f'<OTP for {self.email}>'


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
    return jsonify(message="Welcome to GyanPath.ai Backend!")

@app.route('/test-ai')
def test_ai():
    return jsonify(message="AI functionality placeholder - ready to integrate!")

@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()
    required_fields = ['first_name', 'last_name', 'email', 'password']
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({"error": "Missing required fields: first_name, last_name, email, password"}), 400

    email = data['email'].lower()

    if email not in verified_emails_for_registration:
        return jsonify({"error": "Email not verified or verification expired. Please verify OTP first."}), 403

    verified_emails_for_registration.remove(email)

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email is already registered. Please login or reset password."}), 409

    new_user = User(
        first_name=data['first_name'],
        last_name=data['last_name'],
        email=email
    )
    new_user.set_password(data['password'])
    
    new_user.preferred_content_types = json.dumps(["article", "video"])
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


@app.route('/login', methods=['POST'])
def login_user():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    
    email = email.lower()

    user = User.query.filter_by(email=email).first()

    if user is None or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    
    access_token = create_access_token(identity=str(user.id))
    return jsonify(access_token=access_token, user_id=user.id, email=user.email, 
                   first_name=user.first_name, last_name=user.last_name), 200


@app.route('/users', methods=['GET'])
def get_users():
    users = User.query.all()
    users_list = [{"id": user.id, "email": user.email, "first_name": user.first_name, "last_name": user.last_name} for user in users]
    return jsonify(users_list)

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
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "preferred_content_types": json.loads(user.preferred_content_types),
        "time_availability": user.time_availability,
        "difficulty_preference": user.difficulty_preference
    }), 200

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

    if 'first_name' in data:
        user.first_name = data['first_name']
    if 'last_name' in data:
        user.last_name = data['last_name']
    
    if 'preferred_content_types' in data:
        if isinstance(data['preferred_content_types'], list):
            user.preferred_content_types = json.dumps(data['preferred_content_types'])
        else:
            return jsonify({"error": "preferred_content_types must be a list"}), 400
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
        return jsonify({"error": "Incorrect old password"}), 401
    
    user.set_password(new_password)
    try:
        db.session.commit()
        return jsonify({"message": "Password changed successfully!"}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error changing password for user {user_id}: {e}")
        return jsonify({"error": "Failed to change password", "details": str(e)}), 500


@app.route('/request_otp', methods=['POST'])
def request_otp():
    data = request.get_json()
    email = data.get('email', '').lower()
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email is already registered. Please login or reset password."}), 409

    otp_code = ''.join(random.choices(string.digits, k=6))
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    
    existing_otp = OTP.query.filter_by(email=email).first()
    if existing_otp:
        existing_otp.code = otp_code
        existing_otp.expires_at = expires_at
    else:
        new_otp = OTP(email=email, code=otp_code, expires_at=expires_at)
        db.session.add(new_otp)
    
    try:
        db.session.commit()
        
        msg = Message("Your GyanPath.ai OTP", recipients=[email])
        msg.body = f"Your One-Time Password (OTP) for GyanPath.ai registration is: {otp_code}\n\nThis OTP is valid for 5 minutes."
        mail.send(msg)
        
        logger.info(f"OTP sent to {email}: {otp_code}")
        return jsonify({"message": "OTP sent to your email. Please check your inbox (and spam folder)."}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to send OTP to {email}: {e}")
        return jsonify({"error": "Failed to send OTP. Please try again later.", "details": str(e)}), 500


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
        db.session.delete(otp_record)
        db.session.commit()
        return jsonify({"error": "OTP has expired. Please request a new one."}), 400
    
    db.session.delete(otp_record)
    db.session.commit()
    
    verified_emails_for_registration.add(email)
    
    return jsonify({"message": "OTP verified successfully! You can now proceed to register."}), 200

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
        return jsonify({"message": "Resource with this URL already exists, skipping addition."}), 200

    # The issue here is 'url_to_fetch' is not defined. It comes from /fetch_and_add_resource
    # This block should be within a separate function or endpoint if it's meant to fetch
    # Since this is a direct POST to /resources, it expects data directly.
    # So, the 'if not (url_to_fetch.startswith' block should be removed for add_resource
    # Or, the endpoint should be changed to parse all fields and then make a request if it's external.
    
    # Original logic in app.py for add_resource (before fetch_and_add_resource was introduced)
    # new_resource = Resource(
    #     title=data['title'],
    #     url=data['url'],
    #     description=data.get('description'),
    #     resource_type=data.get('resource_type', 'article'), # Default to article if not provided
    #     source=data.get('source'),
    #     difficulty=data.get('difficulty'),
    #     estimated_time_minutes=data.get('estimated_time_minutes'),
    #     contributed_by_user_id=contributed_by_user_id
    # )

    try:
        # Original logic should be uncommented/restored here
        new_resource = Resource(
            title=data['title'],
            url=data['url'],
            description=data.get('description'),
            resource_type=data.get('resource_type', 'article'), # Default to article if not provided
            source=data.get('source'),
            difficulty=data.get('difficulty'),
            estimated_time_minutes=data.get('estimated_time_minutes'),
            contributed_by_user_id=contributed_by_user_id
        )
        
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