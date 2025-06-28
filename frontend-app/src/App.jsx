import { useState, useEffect } from 'react';
import './App.css'; // Keep original CSS import if you like

function App() {
  const [message, setMessage] = useState("Loading backend message...");
  const [aiMessage, setAiMessage] = useState("Loading AI message...");
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
      .then(data => setMessage(data.message))
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
  }, []); // Empty dependency array means this runs once on component mount

  return (
    <div className="App">
      <h1>SkillBridge Frontend</h1>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <p>Backend Message: {message}</p>
      <p>AI Endpoint Message: {aiMessage}</p>
      {/* You can remove or modify the default Vite/React elements below */}
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