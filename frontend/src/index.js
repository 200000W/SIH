import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Error Boundary for the entire application
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Root error boundary caught an error:", error, errorInfo);

    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // Example: logErrorToService(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f9fafb',
          padding: '2rem'
        }}>
          <div style={{ 
            textAlign: 'center',
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>
              Application Error
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Something went wrong. Please refresh the page or contact support if the problem persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Get the root element
const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found. Make sure you have a div with id='root' in your HTML.");
}

// Create the root and render the application
const root = createRoot(container);

root.render(
  <RootErrorBoundary>
    {/* Only use StrictMode in development */}
    {process.env.NODE_ENV === 'development' ? (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    ) : (
      <App />
    )}
  </RootErrorBoundary>
);

// Register service worker for PWA features (optional)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Web Vitals reporting (optional)
const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

// Start measuring performance
reportWebVitals(console.log);
