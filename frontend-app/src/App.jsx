import { useState, useEffect } from 'react';
import './App.css'; // Keep original CSS import if you like

function App() {
  const [backendMessage, setBackendMessage] = useState("Loading backend message...");
  const [aiMessage, setAiMessage] = useState("Loading AI message...");
  const [resources, setResources] = useState([]); // State to store resources
  const [error, setError] = useState(null);

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

    // <<< NEW: Fetch resources from the backend
    fetch('http://localhost:5000/resources')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setResources(data)) // Set the fetched resources to state
      .catch(error => {
        console.error("Error fetching resources:", error);
        setError("Failed to fetch resources from backend.");
      });
    // >>> END NEW FETCH

  }, []); // Empty dependency array means this runs once on component mount

  return (
    <div className="App">
      <h1>Welcome to SkillBridge!</h1>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      {/* Backend Messages - Keep for initial debugging visibility */}
      <p>Backend Status: {backendMessage}</p>
      <p>AI Service Status: {aiMessage}</p>
      <hr/> {/* Separator */}

      <h2>Available Learning Resources</h2>
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

      {/* You can remove or modify the default Vite/React elements below if desired */}
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