import os
import logging
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from neo4j import GraphDatabase, basic_auth
from werkzeug.security import generate_password_hash, check_password_hash
import spacy

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app) # Enable CORS for all routes (important for frontend communication)

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
        max_connection_lifetime=60 * 5 # <<< ADD THIS LINE: close connections after 5 minutes of idle
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
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f'<User {self.email}>'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

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
    return jsonify(message="Welcome to SkillBridge Backend!")

@app.route('/test-ai')
def test_ai():
    return jsonify(message="AI functionality placeholder - ready to integrate!")

@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data or not 'email' in data or not 'password' in data:
        return jsonify({"error": "Email and password are required"}), 400

    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({"error": "User with this email already exists"}), 409

    new_user = User(email=data['email'])
    new_user.set_password(data['password'])

    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": f"User {new_user.email} created successfully with ID {new_user.id}"}), 201
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

    user = User.query.filter_by(email=email).first()

    if user is None or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    
    return jsonify({
        "message": "Login successful!",
        "user_id": user.id,
        "email": user.email
    }), 200

@app.route('/users', methods=['GET'])
def get_users():
    users = User.query.all()
    users_list = [{"id": user.id, "email": user.email} for user in users]
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
        return jsonify({"error": "Resource with this URL already exists"}), 409

    new_resource = Resource(
        title=data['title'],
        url=data['url'],
        description=data.get('description'),
        resource_type=data['resource_type'],
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
def update_user_knowledge(user_id):
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
def generate_learning_path(user_id):
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
            # Step 1: Ensure target concept exists in KG, if not, create it
            # This is handled by MERGE, but ensure it's valid concept name.
            # No explicit create here as we assume it will be an existing concept.

            # Step 2: Get user's current knowledge (concepts they know and their level)
            user_known_concepts_query = session.run(
                "MATCH (lp:LearnerProfile {user_id: $user_id})-[k:KNOWS_LEVEL]->(c:Concept) "
                "RETURN c.name AS concept_name, k.level AS level",
                user_id=user_id
            )
            user_known_concepts = {r["concept_name"]: r["level"] for r in user_known_concepts_query}
            logger.info(f"User {user_id} known concepts: {user_known_concepts}")

            # Step 3: Find prerequisite concepts for the target concept that the user doesn't know well
            recommended_path = []
            
            # Simple path generation strategy:
            # 1. Find prerequisites that the user doesn't know (level < 3)
            # 2. Find resources for those prerequisites
            # 3. If no unmet prerequisites, find resources for the target concept itself.
            
            # Find unmet prerequisites
            # The error suggests the issue is here: the query or data might not align.
            # Let's ensure a robust way to get prerequisites for target_concept.
            unmet_prerequisites_query = session.run(
                f"""
                MATCH (target:Concept {{name: $target_concept}})
                OPTIONAL MATCH (target)<-[:PREREQUISITE_FOR]-(prereq:Concept)
                WHERE NOT EXISTS {{
                    MATCH (lp:LearnerProfile {{user_id: $user_id}})-[k:KNOWS_LEVEL]->(prereq)
                    WHERE k.level >= 3 // User knows it well enough
                }}
                RETURN prereq.name AS unmet_prereq_name
                """,
                user_id=user_id, target_concept=target_concept
            )
            # Filter out None results if OPTIONAL MATCH finds no prerequisites
            unmet_prerequisites = [r["unmet_prereq_name"] for r in unmet_prerequisites_query if r["unmet_prereq_name"] is not None]
            
            concepts_to_teach = []
            if unmet_prerequisites:
                concepts_to_teach = unmet_prerequisites
                logger.info(f"Unmet prerequisites for {target_concept}: {unmet_prerequisites}")
            else:
                # If all prerequisites are met or none exist, suggest resources for the target concept directly
                concepts_to_teach.append(target_concept)
                logger.info(f"No unmet prerequisites. Suggesting resources for {target_concept}.")


            # Now, find resources that teach these concepts
            for concept in concepts_to_teach:
                resources_for_concept_query = session.run(
                    f"""
                    MATCH (c:Concept {{name: $concept_name}})<-[:TEACHES]-(r:Resource)
                    RETURN r.resource_id AS id, r.title AS title, r.url AS url, r.resource_type AS resource_type,
                           r.source AS source, r.difficulty AS difficulty, r.estimated_time_minutes AS estimated_time_minutes
                    LIMIT 3 // Limit to a few resources per concept
                    """,
                    concept_name=concept
                )
                resources_data = []
                for r in resources_for_concept_query:
                    resource_dict = dict(r)
                    # Convert Neo4j resource_id back to int if needed by frontend
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