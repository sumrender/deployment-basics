/**
 * Centralized Configuration Service for Frontend
 * Loads configuration from environment variables with fallback to defaults
 * 
 * Note: In Next.js, only environment variables prefixed with NEXT_PUBLIC_
 * are exposed to the browser.
 */
class ConfigService {
  private config: {
    api: {
      url: string;
    };
    elasticsearch: {
      url: string;
      indexName: string;
    };
    app: {
      nodeEnv: string;
    };
  };

  constructor() {
    this.config = {
      // API Configuration
      api: {
        url: '/api',
      },

      // Elasticsearch Configuration
      elasticsearch: {
        url: '/es',
        indexName: this._getString('NEXT_PUBLIC_ELASTICSEARCH_INDEX', 'todos'),
      },

      // App Configuration
      app: {
        nodeEnv: this._getString('NODE_ENV', 'development'),
      },
    };

    // Validate configuration on initialization
    this._validate();
  }

  /**
   * Get string value from environment with fallback
   * @private
   */
  private _getString(key: string, defaultValue: string): string {
    // In Next.js, environment variables are available at build time
    // For client-side code, only NEXT_PUBLIC_ prefixed vars are exposed
    // The key should already include NEXT_PUBLIC_ prefix when passed
    const value = process.env[key];
    return value !== undefined && value !== '' ? value : defaultValue;
  }

  /**
   * Get number value from environment with fallback
   * @private
   */
  private _getNumber(key: string, defaultValue: number): number {
    const value = this._getString(key, '');
    if (value === '') {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get boolean value from environment with fallback
   * @private
   */
  private _getBoolean(key: string, defaultValue: boolean): boolean {
    const value = this._getString(key, '');
    if (value === '') {
      return defaultValue;
    }
    return value === 'true' || value === '1';
  }

  /**
   * Validate configuration values
   * @private
   */
  private _validate(): void {
    const errors: string[] = [];

    // Validate API URL format (allow relative paths starting with /)
    if (this.config.api.url.startsWith('/')) {
      // Relative path - valid for routing through ingress
    } else {
      try {
        new URL(this.config.api.url);
      } catch {
        errors.push(`Invalid API URL format: ${this.config.api.url}`);
      }
    }

    // Validate Elasticsearch URL format (allow relative paths starting with /)
    if (this.config.elasticsearch.url.startsWith('/')) {
      // Relative path - valid for routing through ingress
    } else {
      try {
        new URL(this.config.elasticsearch.url);
      } catch {
        errors.push(`Invalid Elasticsearch URL format: ${this.config.elasticsearch.url}`);
      }
    }

    // Validate node environment
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(this.config.app.nodeEnv)) {
      console.warn(
        `⚠️  Unknown NODE_ENV: ${this.config.app.nodeEnv}. Expected one of: ${validEnvs.join(', ')}`
      );
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get API configuration
   */
  getApiConfig() {
    return { ...this.config.api };
  }

  /**
   * Get API URL
   */
  getApiUrl(): string {
    return this.config.api.url;
  }

  /**
   * Get Elasticsearch configuration
   */
  getElasticsearchConfig() {
    return { ...this.config.elasticsearch };
  }

  /**
   * Get Elasticsearch URL
   */
  getElasticsearchUrl(): string {
    return this.config.elasticsearch.url;
  }

  /**
   * Get Elasticsearch index name
   */
  getElasticsearchIndex(): string {
    return this.config.elasticsearch.indexName;
  }

  /**
   * Get app configuration
   */
  getAppConfig() {
    return { ...this.config.app };
  }

  /**
   * Get Node environment
   */
  getNodeEnv(): string {
    return this.config.app.nodeEnv;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.config.app.nodeEnv === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.config.app.nodeEnv === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.config.app.nodeEnv === 'test';
  }

  /**
   * Get entire configuration object
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Print configuration (hides sensitive data)
   * Only works on server-side
   */
  printConfig(): void {
    if (typeof window !== 'undefined') {
      console.warn('printConfig() can only be called on the server-side');
      return;
    }

    console.log('\n📋 Frontend Configuration:');
    console.log('─────────────────────────────────────');
    console.log(`Environment: ${this.config.app.nodeEnv}`);
    console.log(`API URL: ${this.config.api.url}`);
    console.log(`Elasticsearch URL: ${this.config.elasticsearch.url}`);
    console.log(`Elasticsearch Index: ${this.config.elasticsearch.indexName}`);
    console.log('─────────────────────────────────────\n');
  }
}

// Export singleton instance
export default new ConfigService();

