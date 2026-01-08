import { getElasticsearchClient } from '../config/database.js';
import config from '../config/ConfigService.js';
import { v4 as uuidv4 } from 'uuid';

const getIndexName = () => config.getElasticsearchConfig().indexName;

/**
 * Ensures the Elasticsearch index exists, creating it if it doesn't
 * @returns {Promise<void>}
 */
export const getIndex = async () => {
  try {
    const client = getElasticsearchClient();
    const indexName = getIndexName();
    
    if (!client) {
      throw new Error('Elasticsearch client is not initialized');
    }
    
    console.log(`🔍 Checking if Elasticsearch index exists: ${indexName}`);
    
    // Test connection first
    try {
      await client.ping();
      console.log('✅ Elasticsearch connection verified');
    } catch (pingError) {
      console.error('❌ Elasticsearch ping failed:', pingError.message);
      throw new Error(`Cannot connect to Elasticsearch: ${pingError.message}`);
    }
    
    const indexExists = await client.indices.exists({ index: indexName });
    console.log(`   Index exists: ${indexExists}`);
    
    if (!indexExists) {
      console.log(`📝 Creating Elasticsearch index: ${indexName}`);
      await client.indices.create({
        index: indexName,
        body: {
          // This app runs Elasticsearch as a single-node cluster in k8s.
          // Default replicas=1 is unnecessary; keep it at 0.
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: { type: 'text' },
              completed: { type: 'boolean' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log(`✅ Created Elasticsearch index: ${indexName}`);
    } else {
      console.log(`✅ Elasticsearch index already exists: ${indexName}`);
    }
  } catch (error) {
    console.error('❌ Error in getIndex:', error);
    console.error('   Error details:', {
      message: error.message,
      stack: error.stack,
      meta: error.meta,
    });
    throw error;
  }
};

export const indexTodo = async (req, res) => {
  try {
    const { title, completed } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Ensure index exists
    await getIndex();

    const client = getElasticsearchClient();
    const id = uuidv4();
    const todo = {
      id,
      title,
      completed: completed || false,
      createdAt: new Date().toISOString(),
    };

    await client.index({
      index: getIndexName(),
      id,
      document: todo,
      refresh: 'wait_for', // Make document immediately searchable
    });

    res.status(201).json(todo);
  } catch (error) {
    console.error('Error indexing todo:', error);
    res.status(500).json({ error: 'Failed to index todo' });
  }
};

export const searchTodos = async (req, res) => {
  try {
    // Ensure index exists
    await getIndex();

    const { q } = req.query;
    const client = getElasticsearchClient();

    let query = {
      match_all: {},
    };

    if (q) {
      query = {
        wildcard: {
          title: {
            value: `*${q}*`,
            case_insensitive: true,
          },
        },
      };
    }

    const result = await client.search({
      index: getIndexName(),
      query,
      size: 100,
    });

    const todos = result.hits.hits.map((hit) => hit._source);

    res.status(200).json(todos);
  } catch (error) {
    console.error('Error searching todos:', error);
    res.status(500).json({ error: 'Failed to search todos' });
  }
};

