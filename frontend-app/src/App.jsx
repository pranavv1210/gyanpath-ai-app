import { useState, useEffect } from 'react';
import './App.css'; 

function App() {
  const [backendMessage, setBackendMessage] = useState("Loading backend message...");
  const [aiMessage, setAiMessage] = useState("Loading AI message...");
  const [resources, setResources] = useState([]);
  const [error, setError] = useState(null);

  const [targetConcept, setTargetConcept] = useState("");
  const [learningPath, setLearningPath] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathMessage, setPathMessage] = useState(""); // For messages from path generation

  // <<< NEW STATE FOR KNOWLEDGE ASSESSMENT
  const [knowledgeConcept, setKnowledgeConcept] = useState("");
  const [knowledgeLevel, setKnowledgeLevel] = useState(0);
  const [knowledgeUpdateMessage, setKnowledgeUpdateMessage] = useState("");
  const [knowledgeUpdateLoading, setKnowledgeUpdateLoading] = useState(false);
  // >>> END NEW STATE

  // Placeholder for current user ID (for now, always 1)
  const currentUserId = 1; 

  useEffect(() => {
    // Fetch from the root endpoint
    fetch('http://localhost:5000/')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setBackendMessage(data.message))
      .catch(error => {
        console.error("Error fetching root message:", error);
        setError("Failed to fetch root message from backend.");
      });

    // Fetch from the /test-ai endpoint
    fetch('http://localhost:5000/test-ai')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setAiMessage(data.message))
      .catch(error => {
        console.error("Error fetching AI message:", error);
        setError("Failed to fetch AI message from backend.");
      });

    // Fetch all resources from the backend on initial load
    fetch('http://localhost:5000/resources')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setResources(data))
      .catch(error => {
        console.error("Error fetching resources:", error);
        setError("Failed to fetch resources from backend.");
      });

  }, []); // Empty dependency array means this runs once on component mount

  // Function to fetch learning path
  const fetchLearningPath = () => {
    if (!targetConcept) {
      alert("Please enter a target concept!");
      return;
    }
    setPathLoading(true);
    setLearningPath(null);
    setPathMessage(""); // Clear previous messages
    setError(null);

    const encodedTargetConcept = encodeURIComponent(targetConcept);
    fetch(`http://localhost:5000/users/${currentUserId}/learning_path?target_concept=${encodedTargetConcept}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setLearningPath(data);
        setPathMessage(data.message); // Set message from API response
        console.log("Generated Path:", data);
      })
      .catch(error => {
        console.error("Error fetching learning path:", error);
        setError("Failed to generate learning path from backend. Check backend console for details.");
      })
      .finally(() => {
        setPathLoading(false);
      });
  };

  // <<< NEW FUNCTION TO UPDATE USER KNOWLEDGE
  const updateKnowledge = () => {
    if (!knowledgeConcept || knowledgeLevel === 0) { // Level 0 implies not selected
      alert("Please enter a concept and select a level!");
      return;
    }
    setKnowledgeUpdateLoading(true);
    setKnowledgeUpdateMessage("");
    setError(null);

    fetch(`http://localhost:5000/users/${currentUserId}/knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ concept_name: knowledgeConcept, level: knowledgeLevel }),
    })
      .then(response => {
        if (!response.ok) {
          // If response is not OK, parse the error message from backend
          return response.json().then(err => { throw new Error(err.error || 'Unknown error'); });
        }
        return response.json();
      })
      .then(data => {
        setKnowledgeUpdateMessage(data.message);
        console.log("Knowledge Update Result:", data);
      })
      .catch(error => {
        console.error("Error updating knowledge:", error);
        setKnowledgeUpdateMessage(`Error: ${error.message || "Failed to update knowledge."}`);
      })
      .finally(() => {
        setKnowledgeUpdateLoading(false);
      });
  };
  // >>> END NEW FUNCTION

  return (
    <div className="App">
      <h1>Welcome to SkillBridge!</h1>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      {/* Backend Messages - Keep for initial debugging visibility */}
      <p>Backend Status: {backendMessage}</p>
      <p>AI Service Status: {aiMessage}</p>
      <hr/> 

      {/* <<< NEW: Assess Your Knowledge Section */}
      <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginBottom: '30px', backgroundColor: '#e8f5e9' }}>
        <h2>Assess Your Knowledge (User ID: {currentUserId})</h2>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="knowledgeConceptInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Concept:
          </label>
          <input
            id="knowledgeConceptInput"
            type="text"
            value={knowledgeConcept}
            onChange={(e) => setKnowledgeConcept(e.target.value)}
            placeholder="e.g., Python Basics"
            style={{ width: 'calc(100% - 22px)', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="knowledgeLevelSelect" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Level (1=Beginner, 5=Expert):
          </label>
          <select
            id="knowledgeLevelSelect"
            value={knowledgeLevel}
            onChange={(e) => setKnowledgeLevel(parseInt(e.target.value))}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
          >
            <option value="0">-- Select Level --</option>
            <option value="1">1 (Novice)</option>
            <option value="2">2 (Familiar)</option>
            <option value="3">3 (Competent)</option>
            <option value="4">4 (Proficient)</option>
            <option value="5">5 (Expert)</option>
          </select>
        </div>
        <button 
          onClick={updateKnowledge} 
          disabled={knowledgeUpdateLoading}
          style={{ 
            padding: '10px 20px', 
            fontSize: '1em', 
            backgroundColor: '#28a745', // Green for success/knowledge
            color: 'white', 
            border: 'none', 
            borderRadius: '5px', 
            cursor: 'pointer',
            opacity: knowledgeUpdateLoading ? 0.7 : 1
          }}
        >
          {knowledgeUpdateLoading ? 'Updating...' : 'Update Knowledge'}
        </button>
        {knowledgeUpdateMessage && <p style={{ marginTop: '10px', color: knowledgeUpdateMessage.startsWith('Error') ? 'red' : 'green' }}>{knowledgeUpdateMessage}</p>}
      </section>
      {/* >>> END NEW SECTION */}

      {/* Learning Path Generation Section */}
      <section style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h2>Generate Personalized Learning Path (User ID: {currentUserId})</h2>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="targetConceptInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            What do you want to learn?
          </label>
          <input
            id="targetConceptInput"
            type="text"
            value={targetConcept}
            onChange={(e) => setTargetConcept(e.target.value)}
            placeholder="e.g., Machine Learning Fundamentals"
            style={{ width: 'calc(100% - 22px)', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '1em' }}
          />
        </div>
        <button 
          onClick={fetchLearningPath} 
          disabled={pathLoading}
          style={{ 
            padding: '10px 20px', 
            fontSize: '1em', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px', 
            cursor: 'pointer',
            opacity: pathLoading ? 0.7 : 1
          }}
        >
          {pathLoading ? 'Generating...' : 'Generate Path'}
        </button>

        {pathLoading && <p>Generating your personalized path...</p>}
        {learningPath && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
            <h3>Path for "{learningPath.target_concept}"</h3>
            {learningPath.path && learningPath.path.length > 0 ? (
              learningPath.path.map((step, index) => (
                <div key={index} style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '6px', borderLeft: '5px solid #007bff' }}>
                  <h4>Step {index + 1}: Learn "{step.concept}"</h4>
                  {step.resources && step.resources.length > 0 ? (
                    <ul>
                      {step.resources.map(res => (
                        <li key={res.id} style={{ marginBottom: '5px' }}>
                          <a href={res.url} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>
                            {res.title}
                          </a> ({res.resource_type || 'N/A'})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No resources found for this concept in the path (yet).</p>
                  )}
                </div>
              ))
            ) : (
              <p>{pathMessage || "No specific steps recommended at this time based on your knowledge."}</p>
            )}
          </div>
        )}
      </section>

      <hr/>

      <h2>Available Learning Resources (All)</h2>
      {resources.length === 0 ? (
        <p>No resources found. Add some using Postman or a future admin interface!</p>
      ) : (
        <div className="resources-list">
          {resources.map(resource => (
            <div key={resource.id} className="resource-card" style={{ marginBottom: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
              <h3>{resource.title}</h3>
              <p><strong>Type:</strong> {resource.resource_type} | <strong>Source:</strong> {resource.source || 'N/A'}</p>
              <p><strong>Difficulty:</strong> {resource.difficulty || 'N/A'} | <strong>Est. Time:</strong> {resource.estimated_time_minutes ? `${resource.estimated_time_minutes} mins` : 'N/A'}</p>
              <p>{resource.description}</p>
              <a href={resource.url} target="_blank" rel="noopener noreferrer">Learn More</a>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  );
}

export default App;