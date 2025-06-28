from flask import Flask, jsonify
from flask_cors import CORS # Add this import

app = Flask(__name__)
CORS(app) # Add this line to enable CORS for all routes by default

@app.route('/')
def hello_world():
    return jsonify(message="Welcome to SkillBridge Backend!")

@app.route('/test-ai')
def test_ai():
    return jsonify(message="AI functionality placeholder - ready to integrate!")

if __name__ == '__main__':
    app.run(debug=True, port=5000)