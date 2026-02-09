import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, query } from './db/connection.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Database connection test endpoint
app.get('/api/db/test', async (req: Request, res: Response) => {
  try {
    const isConnected = await testConnection();
    if (isConnected) {
      res.json({ 
        status: 'success', 
        message: 'Database connection successful',
        database: process.env.DB_NAME || 'panavid_14_10_25',
        host: process.env.DB_HOST || 'localhost'
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: 'Database connection failed',
        database: process.env.DB_NAME || 'panavid_14_10_25',
        host: process.env.DB_HOST || 'localhost'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection error',
      error: error instanceof Error ? error.message : 'Unknown error',
      database: process.env.DB_NAME || 'panavid_14_10_25',
      host: process.env.DB_HOST || 'localhost'
    });
  }
});

// Example endpoint: Get all templates
app.get('/api/templates', async (req: Request, res: Response) => {
  try {
    const results = await query('SELECT * FROM templates ORDER BY created_at DESC');
    res.json({ status: 'success', data: results });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch templates',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Example endpoint: Get template by ID
app.get('/api/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const results = await query('SELECT * FROM templates WHERE id = ?', [id]);
    
    if (Array.isArray(results) && results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Template not found' });
    }
    
    res.json({ status: 'success', data: results[0] });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Example endpoint: Create template
app.post('/api/templates', async (req: Request, res: Response) => {
  try {
    const { name, data } = req.body;
    
    if (!name || !data) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Name and data are required' 
      });
    }

    const result = await query(
      'INSERT INTO templates (name, data, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      [name, JSON.stringify(data)]
    );

    res.status(201).json({ 
      status: 'success', 
      message: 'Template created successfully',
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to create template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Example endpoint: Update template
app.put('/api/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, data } = req.body;

    const result = await query(
      'UPDATE templates SET name = ?, data = ?, updated_at = NOW() WHERE id = ?',
      [name, JSON.stringify(data), id]
    );

    res.json({ 
      status: 'success', 
      message: 'Template updated successfully',
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to update template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Example endpoint: Delete template
app.delete('/api/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM templates WHERE id = ?', [id]);
    
    res.json({ 
      status: 'success', 
      message: 'Template deleted successfully',
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to delete template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Database test: http://localhost:${PORT}/api/db/test`);
  
  // Test database connection on startup
  await testConnection();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
