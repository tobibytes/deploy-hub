# Deploy Hub - Docker Container Management Platform

A full-stack application for managing Docker containers with a beautiful UI. Deploy, manage, and monitor Docker containers locally with ease.

## Features

✅ **Real Container Orchestration**
- Deploy Docker containers from any public Docker image
- Real-time container management (start, stop, delete)
- Automatic port allocation and local URL generation
- Resource limits (CPU and Memory)
- Container logs viewing

✅ **Modern UI**
- Beautiful React frontend with Tailwind CSS
- Real-time status updates
- Dashboard with container statistics
- Deployment history tracking

✅ **Backend API**
- Express.js server with Docker integration
- RESTful API for container management
- Dockerode for Docker Engine communication

## Prerequisites

- Node.js (v18 or higher)
- Docker Engine installed and running
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd deploy-hub
```

2. Install dependencies:
```bash
npm install
```

3. Make sure Docker is running:
```bash
docker --version
# Should output Docker version
```

## Running the Application

### Option 1: Run Backend and Frontend Separately

**Terminal 1 - Start the backend server:**
```bash
npm run server
```
The backend will start on http://localhost:3001

**Terminal 2 - Start the frontend:**
```bash
npm run dev
```
The frontend will start on http://localhost:5173

### Option 2: Run Both Together (requires `concurrently` package)

```bash
npm run dev:all
```

## Usage

1. **Access the Application**
   - Open http://localhost:5173 in your browser
   - You may need to sign up/login if authentication is enabled

2. **Deploy a Container**
   - Click "New Container" button
   - Fill in the form:
     - **Project Name**: A name for your project
     - **Container Name**: Name for the container
     - **Docker Image**: Any public Docker image (e.g., `nginx:alpine`, `httpd:alpine`, `node:18-alpine`)
     - **Port**: Host port where the container will be accessible (optional, auto-assigned if not provided)
     - **CPU/Memory**: Resource limits
   - Click "Deploy Container"
   - Wait for deployment to complete

3. **Manage Containers**
   - View all containers in the Containers page
   - Click **Start** to start a stopped container
   - Click **Stop** to stop a running container
   - Click the menu icon for more options (Delete, Settings, etc.)
   - Click on the local URL to access running containers

4. **View Deployments**
   - Go to Deployments page to see deployment history
   - View logs for each deployment
   - Track deployment status and duration

## Example Docker Images to Try

- **Web Servers**: `nginx:alpine`, `httpd:alpine`
- **Node.js Apps**: `node:18-alpine`
- **Python Apps**: `python:3.11-alpine`
- **Databases** (advanced): `postgres:alpine`, `redis:alpine`

## API Endpoints

The backend server exposes the following REST API endpoints:

- `GET /api/health` - Health check
- `GET /api/containers` - List all containers
- `GET /api/containers/:id` - Get container details
- `POST /api/containers` - Deploy a new container
- `POST /api/containers/:id/start` - Start a container
- `POST /api/containers/:id/stop` - Stop a container
- `DELETE /api/containers/:id` - Delete a container
- `GET /api/containers/:id/logs` - Get container logs

## Technology Stack

### Frontend
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Router
- Tanstack Query
- Supabase (for database)

### Backend
- Node.js
- Express.js
- TypeScript
- Dockerode (Docker API client)
- CORS enabled

## Project Structure

```
deploy-hub/
├── src/               # Frontend React application
│   ├── components/    # React components
│   ├── pages/         # Page components
│   ├── lib/           # Utilities and API clients
│   └── hooks/         # Custom React hooks
├── server/            # Backend Express server
│   └── index.ts       # Main server file
├── supabase/          # Database migrations
└── public/            # Static assets
```

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
VITE_BACKEND_URL=http://localhost:3001
```

## Troubleshooting

### "Cannot connect to Docker daemon"
- Make sure Docker is running: `docker ps`
- Check Docker socket permissions: `ls -l /var/run/docker.sock`

### Backend not starting
- Make sure port 3001 is not in use: `lsof -i :3001`
- Check backend logs for errors

### Container not accessible
- Verify container is running: `docker ps`
- Check port bindings: `docker port <container-name>`
- Try accessing with curl: `curl http://localhost:<port>`

## Development

### Building for Production

```bash
# Build frontend
npm run build

# Preview production build
npm run preview
```

### Linting

```bash
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Roadmap

- [ ] Custom domain support
- [ ] Environment variables management
- [ ] Docker Compose support
- [ ] Container statistics and monitoring
- [ ] Webhook integrations
- [ ] Multi-user support with RBAC
- [ ] Container backups and snapshots
