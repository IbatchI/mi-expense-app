/**
 * Custom Dependency Injection Container
 * 
 * Simple, lightweight DI container for managing dependencies in the Clean Architecture.
 * Supports singleton and transient lifetimes, interface-based registration, and circular dependency detection.
 */

export type ServiceLifetime = 'singleton' | 'transient';
export type Factory<T> = () => T;
export type Constructor<T = {}> = new (...args: any[]) => T;

interface ServiceDescriptor<T = any> {
  factory: Factory<T>;
  lifetime: ServiceLifetime;
  instance?: T;
}

export class DIContainer {
  private services = new Map<string, ServiceDescriptor>();
  private resolutionStack = new Set<string>();

  /**
   * Registers a service with a factory function
   */
  register<T>(
    token: string | Constructor<T>, 
    factory: Factory<T>, 
    lifetime: ServiceLifetime = 'transient'
  ): DIContainer {
    const key = this.getServiceKey(token);
    
    this.services.set(key, {
      factory,
      lifetime,
      instance: undefined
    });

    return this;
  }

  /**
   * Registers a singleton service (only one instance will be created)
   */
  registerSingleton<T>(
    token: string | Constructor<T>, 
    factory: Factory<T>
  ): DIContainer {
    return this.register(token, factory, 'singleton');
  }

  /**
   * Registers a transient service (new instance on every resolve)
   */
  registerTransient<T>(
    token: string | Constructor<T>, 
    factory: Factory<T>
  ): DIContainer {
    return this.register(token, factory, 'transient');
  }

  /**
   * Registers an instance as a singleton
   */
  registerInstance<T>(
    token: string | Constructor<T>, 
    instance: T
  ): DIContainer {
    const key = this.getServiceKey(token);
    
    this.services.set(key, {
      factory: () => instance,
      lifetime: 'singleton',
      instance: instance
    });

    return this;
  }

  /**
   * Registers a class constructor with automatic dependency resolution
   */
  registerClass<T>(
    token: string | Constructor<T>,
    constructor: Constructor<T>,
    lifetime: ServiceLifetime = 'transient'
  ): DIContainer {
    const factory = () => new constructor();
    return this.register(token, factory, lifetime);
  }

  /**
   * Resolves a service by its token
   */
  resolve<T>(token: string | Constructor<T>): T {
    const key = this.getServiceKey(token);
    
    // Check for circular dependencies
    if (this.resolutionStack.has(key)) {
      const cycle = Array.from(this.resolutionStack).join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle} -> ${key}`);
    }

    const descriptor = this.services.get(key);
    if (!descriptor) {
      throw new Error(`Service not registered: ${key}`);
    }

    // Return existing singleton instance
    if (descriptor.lifetime === 'singleton' && descriptor.instance !== undefined) {
      return descriptor.instance;
    }

    // Create new instance
    this.resolutionStack.add(key);
    
    try {
      const instance = descriptor.factory();
      
      // Cache singleton instance
      if (descriptor.lifetime === 'singleton') {
        descriptor.instance = instance;
      }
      
      return instance;
    } catch (error) {
      throw new Error(`Failed to resolve service '${key}': ${error instanceof Error ? error.message : error}`);
    } finally {
      this.resolutionStack.delete(key);
    }
  }

  /**
   * Checks if a service is registered
   */
  isRegistered<T>(token: string | Constructor<T>): boolean {
    const key = this.getServiceKey(token);
    return this.services.has(key);
  }

  /**
   * Removes a service registration
   */
  unregister<T>(token: string | Constructor<T>): boolean {
    const key = this.getServiceKey(token);
    return this.services.delete(key);
  }

  /**
   * Clears all service registrations
   */
  clear(): void {
    this.services.clear();
    this.resolutionStack.clear();
  }

  /**
   * Gets all registered service keys
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Creates a child container that inherits from this container
   */
  createChild(): DIContainer {
    const child = new DIContainer();
    
    // Copy all parent services to child
    for (const [key, descriptor] of this.services.entries()) {
      child.services.set(key, {
        factory: descriptor.factory,
        lifetime: descriptor.lifetime,
        instance: descriptor.instance // Share singleton instances
      });
    }
    
    return child;
  }

  /**
   * Helper method to create service factory with dependency injection
   */
  createFactory<T>(
    constructor: Constructor<T>,
    dependencies: (string | Constructor<any>)[]
  ): Factory<T> {
    return () => {
      const resolvedDeps = dependencies.map(dep => this.resolve(dep));
      return new constructor(...resolvedDeps);
    };
  }

  private getServiceKey<T>(token: string | Constructor<T>): string {
    if (typeof token === 'string') {
      return token;
    } else {
      return token.name;
    }
  }
}

/**
 * Global container instance for simple usage scenarios
 */
export const container = new DIContainer();

/**
 * Service registration decorator (for class-based registration)
 */
export function Service(lifetime: ServiceLifetime = 'transient') {
  return function<T extends Constructor>(constructor: T) {
    container.registerClass(constructor, constructor, lifetime);
    return constructor;
  };
}

/**
 * Helper type for creating service tokens
 */
export class ServiceToken {
  constructor(public readonly name: string) {}
  
  toString(): string {
    return this.name;
  }
}

/**
 * Creates a typed service token
 */
export function createToken(name: string): ServiceToken {
  return new ServiceToken(name);
}

// Common service tokens
export const SERVICE_TOKENS = {
  // Configuration
  CONFIG: createToken('CONFIG'),
  ENVIRONMENT: createToken('ENVIRONMENT'),
  
  // External Services
  LLM_EXTRACTOR: createToken('LLM_EXTRACTOR'),
  PDF_PARSER: createToken('PDF_PARSER'),
  LOGGER: createToken('LOGGER'),
  
  // Repositories
  STATEMENT_REPOSITORY: createToken('STATEMENT_REPOSITORY'),
  
  // Use Cases
  EXTRACT_STATEMENT_USE_CASE: createToken('EXTRACT_STATEMENT_USE_CASE'),
  CATEGORIZE_EXPENSES_USE_CASE: createToken('CATEGORIZE_EXPENSES_USE_CASE'),
  
  // Adapters
  STATEMENT_CONTROLLER: createToken('STATEMENT_CONTROLLER'),
  
  // Infrastructure
  WEB_SERVER: createToken('WEB_SERVER'),
  LAMBDA_HANDLER: createToken('LAMBDA_HANDLER')
} as const;