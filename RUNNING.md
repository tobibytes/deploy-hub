# Running Deploy Hub

This guide explains how to run the Deploy Hub application locally.

## Prerequisites

- Node.js (v20 or later)
- npm
- Docker (if using the dockerized backend)

## Running the Application

### Option 1: Run Everything with One Script

Run both frontend and backend together:

```bash
./run-all.sh
```

This will start:
- Frontend at http://localhost:5173
- Backend at http://localhost:3001

### Option 2: Run Frontend and Backend Separately

**Run Frontend Only:**

```bash
./run-frontend.sh
```

The frontend will be available at http://localhost:5173

**Run Backend Only (Local):**

```bash
./run-backend.sh
```

The backend will be available at http://localhost:3001

### Option 3: Run Backend in Docker

To run the backend in a Docker container:

```bash
./run-backend-docker.sh
```

This script will:
1. Build a Docker image for the backend
2. Stop any existing backend container
3. Start a new container with the backend running on port 3001

**Important:** The dockerized backend needs access to the host's Docker daemon to manage containers. The script mounts `/var/run/docker.sock` into the container.

## Installing Dependencies

If you haven't installed dependencies yet:

```bash
npm install
```

## Development

- The frontend uses Vite for hot-reloading
- The backend uses `tsx watch` for auto-restart on file changes
- Both will automatically reload when you make changes to the code

## Stopping the Application

Press `Ctrl+C` in the terminal where the scripts are running to stop the servers.

To stop the dockerized backend:

```bash
docker stop deploy-hub-backend-container
```
