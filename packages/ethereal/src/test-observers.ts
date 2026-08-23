export class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = []
  readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }
  unobserve(target: Element) {
    this.targets.delete(target)
  }
  disconnect() {
    this.targets.clear()
  }
  takeRecords(): ResizeObserverEntry[] {
    return []
  }
  trigger() {
    const entries = [...this.targets].map((target) => ({ target }) as ResizeObserverEntry)
    this.callback(entries, this)
  }
}

export class ControlledIntersectionObserver implements IntersectionObserver {
  static instances: ControlledIntersectionObserver[] = []
  readonly root = null
  readonly rootMargin = '0px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]
  readonly targets = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    ControlledIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }
  unobserve(target: Element) {
    this.targets.delete(target)
  }
  disconnect() {
    this.targets.clear()
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  trigger(isIntersecting: boolean) {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }) as IntersectionObserverEntry,
    )
    this.callback(entries, this)
  }
}

export function installControlledObservers() {
  ControlledResizeObserver.instances = []
  ControlledIntersectionObserver.instances = []
  const globals = globalThis as Record<string, unknown>
  globals.ResizeObserver = ControlledResizeObserver
  globals.IntersectionObserver = ControlledIntersectionObserver
}
