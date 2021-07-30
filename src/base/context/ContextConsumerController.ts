import { ReactiveController, ReactiveControllerHost } from 'lit';

import { isNil, isUndefined, notEqual } from '../../utils/unit';
import { DisposalBin, vdsEvent } from '../events';

export type ConsumeContextOptions<T> = {
  /**
   * A unique identifier used to pair a context provider and consumer.
   */
  id: symbol;
  /**
   * For backwards compatiblity - currently does nothing.
   */
  debug?: boolean;
  /**
   * Whether context updates should also request an update on the controller host to trigger
   * a re-render.
   */
  shouldRequestUpdate?: boolean;
  /**
   * Called when the consumer has connected to a provider.
   */
  onConnect?(): void;
  /**
   * Called when the consumed value is updated.
   */
  onUpdate?(newValue: T): void;
  /**
   * Called when the host controller has disconnected from the DOM or from a connected provider.
   */
  onDisconnect?(): void;
  /**
   * Used to transform the consumed value as it's updated.
   */
  transform?: (newValue: T) => T;
};

export class ContextConsumerController<T> implements ReactiveController {
  protected _value: T;

  protected _ref?: Element;

  protected _hasConnectedToProvider = false;

  protected readonly _disposal = new DisposalBin();

  protected readonly consumerId = Symbol('Vidstack.consumerId');

  get id() {
    return this._options.id;
  }

  get value() {
    return this._value;
  }

  /**
   * Whether the consumer is currently connected to a provider.
   */
  get isConnected() {
    return this._hasConnectedToProvider;
  }

  constructor(
    protected readonly _host: ReactiveControllerHost,
    public readonly initialValue: T,
    protected readonly _options: ConsumeContextOptions<T>
  ) {
    this._value = this._transformValue(initialValue);
    if (_host instanceof Element) this.setRef(_host);
    _host.addController(this);
  }

  hostConnected() {
    this.start();
  }

  hostDisconnected() {
    this._handleContextUpdate(this.initialValue);
    this.stop();
  }

  /**
   * Set a reference to a DOM element that this controller will use to connect to a provider
   * by dispatching a connect event from it. The reference element's position in the DOM will
   * dictate which provider it connects to, since it'll connect to the first parent provider
   * that provides the current context.
   */
  setRef(newRef?: Element) {
    this._ref = newRef;
  }

  /**
   * Start consuming context.
   */
  start() {
    if (this._hasConnectedToProvider || isNil(this._ref)) return;

    this._ref.dispatchEvent(
      vdsEvent('vds-context-consumer-connect', {
        bubbles: true,
        composed: true,
        detail: {
          id: this.id,
          consumerId: this.consumerId,
          onConnect: this._handleContextConnect.bind(this),
          onUpdate: this._handleContextUpdate.bind(this),
          onDisconnect: this._handleContextDisconnect.bind(this),
          reconnect: this.reconnect.bind(this)
        }
      })
    );
  }

  /**
   * Stop consuming context.
   */
  stop() {
    if (!this._hasConnectedToProvider) return;
    this._disposal.empty();
    this._options.onDisconnect?.();
    this._hasConnectedToProvider = false;
  }

  /**
   * Stop current connection to provider and attempts to reconnect.
   */
  reconnect() {
    this.stop();
    this.start();
  }

  protected _handleContextConnect() {
    this._hasConnectedToProvider = true;
    this._options.onConnect?.();
    this._options.onUpdate?.(this._value);
  }

  protected _handleContextUpdate(newValue: T) {
    const transformedValue = this._transformValue(newValue);

    if (notEqual(transformedValue, this._value)) {
      this._value = transformedValue;
      this._options.onUpdate?.(transformedValue);

      if (this._options.shouldRequestUpdate) {
        this._host.requestUpdate();
      }
    }
  }

  protected _handleContextDisconnect(callback: () => void) {
    this._disposal.add(callback);
  }

  protected _transformValue(value: T): T {
    return !isUndefined(this._options.transform)
      ? this._options.transform(value)
      : value;
  }
}
