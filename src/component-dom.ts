import { ComponentHTMLElement, Props, WithChildren, TEXT_ELEMENT } from './component'

///
type RequestIdleCallbackHandle = any

type RequestIdleCallbackOptions = {
  timeout: number
}

type RequestIdleCallbackDeadline = {
  readonly didTimeout: boolean
  timeRemaining: () => number
}

declare global {
  interface Window {
    requestIdleCallback: (
      callback: (deadline: RequestIdleCallbackDeadline) => void,
      opts?: RequestIdleCallbackOptions
    ) => RequestIdleCallbackHandle
    cancelIdleCallback: (handle: RequestIdleCallbackHandle) => void
  }
}
///

type Fiber<T extends string | Function> = {
  type: T
  props: Props
  parent?: HostFiber | FunctionFiber
  child?: HostFiber | FunctionFiber
  sibling?: HostFiber | FunctionFiber
  dom?: WriteableNode
  alternate?: HostFiber | FunctionFiber
  effectTag?: string
}

type HostFiber = Fiber<string>

type FunctionFiber = Fiber<Function>

type Writeable<T> = { -readonly [P in keyof T]: T[P] }

type WriteableNode = WriteableHTMLElement | WriteableText

type WriteableHTMLElement = Writeable<HTMLElement>

type WriteableText = Writeable<Text>

function createDom(fiber: HostFiber): HTMLElement | Text {
  const dom =
    fiber.type === TEXT_ELEMENT ? document.createTextNode('') : document.createElement(fiber.type)

  updateDom(dom, { children: [] }, fiber.props)

  return dom
}

function isEvent(key: string): boolean {
  return key.startsWith('on')
}

function isProperty(key: string): boolean {
  return key !== 'children' && !isEvent(key)
}

function isNew<T, K extends keyof T>(
  prev: WithChildren<T> & Props,
  next: WithChildren<T> & Props
): (key: K) => boolean {
  return function(key: K): boolean {
    return prev[key] !== next[key]
  }
}

function isGone<T, K extends keyof T>(
  prev: WithChildren<T> & Props,
  next: WithChildren<T> & Props
): (key: K) => boolean {
  return function(key: K): boolean {
    return !(key in next)
  }
}

function updateDom<T extends HTMLElement | Text, K extends keyof T>(
  dom: T,
  prevProps: WithChildren<T> & Props,
  nextProps: WithChildren<T> & Props
) {
  const prevPropsEvents = Object.keys(prevProps).filter(isEvent) as K[]
  prevPropsEvents
    .filter(key => !isGone(prevProps, nextProps)(key) || isNew(prevProps, nextProps)(key))
    .forEach(key => {
      const eventType = key
        .toString()
        .toLowerCase()
        .substring(2)
      const eventCallback = (prevProps[key] as unknown) as EventListenerOrEventListenerObject
      dom.removeEventListener(eventType, eventCallback)
    })

  const prevPropsProperties = Object.keys(prevProps).filter(isProperty) as K[]
  prevPropsProperties.filter(isGone(prevProps, nextProps)).forEach(key => {
    delete dom[key]
  })

  const nextPropsProperties = Object.keys(nextProps).filter(isProperty) as K[]
  nextPropsProperties.filter(isNew(prevProps, nextProps)).forEach(key => {
    dom[key] = (nextProps[key] as unknown) as T[K]
  })

  const nextPropsEvents = Object.keys(nextProps).filter(isEvent) as K[]
  nextPropsEvents.filter(isNew(prevProps, nextProps)).forEach(key => {
    const eventType = key
      .toString()
      .toLowerCase()
      .substring(2)
    const eventCallback = (nextProps[key] as unknown) as EventListenerOrEventListenerObject
    dom.addEventListener(eventType, eventCallback)
  })
}

function commitRoot() {
  deletions.forEach(commitWork)
  commitWork(wipRoot?.child)
  currentRoot = wipRoot
  wipRoot = null
}

function commitWork(fiber?: HostFiber | FunctionFiber) {
  if (!fiber) {
    return
  }

  let domParentFiber = fiber.parent! // TODO
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent!
  }
  const domParent = domParentFiber.dom

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom) {
    domParent.appendChild(fiber.dom)
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate!.props, fiber.props) // TODO
  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent)
  }
  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

function commitDeletion(fiber: HostFiber | FunctionFiber, domParent: WriteableNode) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom)
  } else {
    commitDeletion(fiber.child!, domParent)
  }
}

function render(element: ComponentHTMLElement, container: HTMLElement | Text) {
  wipRoot = {
    props: {
      children: [element]
    },
    dom: container,
    alternate: currentRoot
  } as HostFiber | FunctionFiber
  deletions = []
  nextUnitOfWork = wipRoot
}

let nextUnitOfWork: HostFiber | FunctionFiber | null = null
let currentRoot: HostFiber | FunctionFiber | null = null
let wipRoot: HostFiber | FunctionFiber | null = null
let deletions: Array<HostFiber | FunctionFiber> = []

function workLoop(deadline: RequestIdleCallbackDeadline) {
  let shouldYield = false
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot()
  }

  window.requestIdleCallback(workLoop)
}

window.requestIdleCallback(workLoop)

function performUnitOfWork(fiber: HostFiber | FunctionFiber): HostFiber | FunctionFiber | null {
  const isFunctionComponent = fiber.type instanceof Function

  if (isFunctionComponent) {
    updateFunctionComponent(fiber as FunctionFiber)
  } else {
    updateHostComponent(fiber as HostFiber)
  }

  if (fiber.child) {
    return fiber.child
  }

  let nextFiber: HostFiber | FunctionFiber | null = fiber

  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    nextFiber = nextFiber.parent || null
  }

  return null
}

function updateFunctionComponent(fiber: FunctionFiber) {
  const children = [fiber.type(fiber.props)]
  reconcileChildren(fiber, children)
}

function updateHostComponent(fiber: HostFiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }
  reconcileChildren(fiber, fiber.props.children)
}

function reconcileChildren(wipFiber: HostFiber | FunctionFiber, elements: ComponentHTMLElement[]) {
  let index = 0
  let oldFiber = wipFiber.alternate?.child
  let prevSibling: HostFiber | FunctionFiber | null = null

  while (index < elements.length || oldFiber) {
    const element = elements[index]
    let newFiber: HostFiber | FunctionFiber | null = null

    const sameType = oldFiber && element?.type === oldFiber.type

    if (sameType) {
      newFiber = {
        type: oldFiber!.type,
        props: element.props,
        dom: oldFiber!.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: 'UPDATE'
      } as HostFiber | FunctionFiber
    }

    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        parent: wipFiber,
        effectTag: 'PLACEMENT'
      } as HostFiber | FunctionFiber
    }

    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION'
      deletions.push(oldFiber)
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling
    }

    if (index === 0) {
      wipFiber.child = newFiber || undefined
    } else {
      prevSibling!.sibling = newFiber || undefined
    }

    prevSibling = newFiber
    index++
  }
}

export default {
  render
}
