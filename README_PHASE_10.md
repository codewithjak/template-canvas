# Phase 10: Node.js Backend with MySQL Connection

## Overview
This phase adds a Node.js backend server with MySQL database connection to the Template Canvas Editor project, enabling server-side storage and retrieval of templates.

## Implementation Details

### Dependencies Installed

#### Backend Dependencies
- **mysql2** (^3.16.3) - MySQL client for Node.js with Promise support
- **express** (^5.2.1) - Web framework for Node.js
- **dotenv** (^17.2.4) - Environment variable management
- **cors** (^2.8.6) - Cross-Origin Resource Sharing middleware

#### Development Dependencies
- **@types/express** (^5.0.6) - TypeScript definitions for Express
- **@types/cors** (^2.8.19) - TypeScript definitions for CORS
- **tsx** (^4.21.0) - TypeScript execution engine for development

### Server Structure

```
server/
├── db/
│   ├── connection.ts    # MySQL connection pool and utilities
│   └── schema.sql       # Database schema for templates
├── index.ts             # Express server and API routes
└── README.md            # Server documentation
```

### Components Created

#### 1. Database Connection (`server/db/connection.ts`)
- **Connection Pool**: Configured MySQL connection pool with configurable limits
- **Environment Configuration**: Reads database credentials from `.env` file
- **Connection Testing**: `testConnection()` function to verify database connectivity
- **Query Execution**: `query()` function for executing SQL queries with parameterized statements
- **Connection Management**: Functions to get connections and close the pool

**Features:**
- ✅ Connection pooling for better performance
- ✅ Environment-based configuration
- ✅ Error handling and logging
- ✅ Type-safe query execution
- ✅ Graceful connection management

#### 2. Express Server (`server/index.ts`)
- **RESTful API**: Full CRUD operations for templates
- **Health Endpoints**: Server and database health checks
- **Error Handling**: Comprehensive error handling with proper HTTP status codes
- **CORS Support**: Enabled for cross-origin requests
- **JSON Parsing**: Middleware for parsing JSON request bodies

**API Endpoints:**
- `GET /health` - Server health check
- `GET /api/db/test` - Database connection test
- `GET /api/templates` - Get all templates
- `GET /api/templates/:id` - Get template by ID
- `POST /api/templates` - Create new template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

#### 3. Database Schema (`server/db/schema.sql`)
- **Templates Table**: Stores template data with metadata
- **JSON Storage**: Uses MySQL JSON data type for flexible template storage
- **Indexes**: Optimized with indexes on name and created_at
- **Timestamps**: Automatic created_at and updated_at tracking

**Table Structure:**
```sql
CREATE TABLE templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Configuration Files

#### 1. Environment Variables (`.env.example`)
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=template_canvas_db
DB_PORT=3306
```

#### 2. TypeScript Configuration (`tsconfig.server.json`)
- Separate TypeScript config for server code
- ES2020 target with ESNext modules
- Node.js module resolution
- Source maps and declarations enabled

#### 3. Updated `.gitignore`
- Added `.env` and environment variable files to prevent committing sensitive data

### Package.json Scripts

#### New Scripts Added
- **`npm run dev:server`** - Run server in development mode with auto-reload (using tsx watch)
- **`npm run server`** - Run server in production mode

### Features

- ✅ MySQL connection pooling
- ✅ Environment-based configuration
- ✅ RESTful API endpoints
- ✅ Full CRUD operations for templates
- ✅ JSON data storage
- ✅ Health check endpoints
- ✅ Error handling and logging
- ✅ CORS support
- ✅ TypeScript support
- ✅ Auto-reload in development mode

### Database Connection Configuration

#### Connection Pool Settings
- **Connection Limit**: 10 concurrent connections
- **Queue Limit**: 0 (unlimited queue)
- **Wait for Connections**: Enabled
- **Auto-reconnect**: Handled by mysql2

#### Environment Variables
All database configuration is managed through environment variables:
- `DB_HOST` - Database host (default: localhost)
- `DB_USER` - Database user (default: root)
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (default: template_canvas_db)
- `DB_PORT` - Database port (default: 3306)
- `PORT` - Server port (default: 3000)

### API Usage Examples

#### Create Template
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invoice Template",
    "data": {
      "version": "1.0",
      "elements": [
        {
          "id": "text-1",
          "type": "text",
          "content": "Invoice #{{invoice_number}}",
          "position": {"x": 100, "y": 50},
          "style": {"fontSize": 16, "fontWeight": "normal", "color": "#000000"}
        }
      ]
    }
  }'
```

#### Get All Templates
```bash
curl http://localhost:3000/api/templates
```

#### Get Template by ID
```bash
curl http://localhost:3000/api/templates/1
```

#### Update Template
```bash
curl -X PUT http://localhost:3000/api/templates/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Template",
    "data": {...}
  }'
```

#### Delete Template
```bash
curl -X DELETE http://localhost:3000/api/templates/1
```

### Setup Instructions

#### 1. Install Dependencies
Dependencies are already installed. If needed:
```bash
npm install
```

#### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

#### 3. Create Database
```sql
CREATE DATABASE IF NOT EXISTS template_canvas_db;
```

#### 4. Run Schema
```bash
mysql -u root -p template_canvas_db < server/db/schema.sql
```

#### 5. Start Server
```bash
npm run dev:server
```

### Technical Implementation

#### Connection Pool Pattern
Uses MySQL connection pooling to efficiently manage database connections:
- Reuses connections instead of creating new ones
- Limits concurrent connections to prevent resource exhaustion
- Handles connection errors gracefully

#### Query Execution
All queries use parameterized statements to prevent SQL injection:
```typescript
await query('SELECT * FROM templates WHERE id = ?', [id]);
```

#### Error Handling
Comprehensive error handling at multiple levels:
- Database connection errors
- Query execution errors
- API request validation errors
- HTTP error responses with appropriate status codes

#### Type Safety
Full TypeScript support with:
- Typed query results
- Type-safe request/response handling
- Interface definitions for data structures

### Security Considerations

- ✅ Parameterized queries (SQL injection prevention)
- ✅ Environment variables for sensitive data
- ✅ `.env` file excluded from version control
- ✅ CORS configuration for cross-origin requests
- ✅ Input validation on API endpoints

### Edge Cases Handled

- Database connection failures
- Invalid query parameters
- Missing required fields in requests
- Template not found scenarios
- JSON parsing errors
- Connection pool exhaustion
- Graceful server shutdown

## Files Created

- `server/db/connection.ts` - MySQL connection pool
- `server/db/schema.sql` - Database schema
- `server/index.ts` - Express server
- `server/README.md` - Server documentation
- `tsconfig.server.json` - Server TypeScript config
- `.env.example` - Environment variables template

## Files Modified

- `package.json` - Added server dependencies and scripts
- `.gitignore` - Added `.env` files

## Next Steps

The backend server is now ready for:
- ✅ Storing templates in MySQL database
- ✅ Retrieving templates via API
- ✅ Integration with frontend application
- ✅ Further API endpoint expansion
- ✅ Authentication and authorization (future phase)
