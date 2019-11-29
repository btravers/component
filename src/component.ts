export type ComponentHTMLElement = {
  type: string
  props: Props
}

export type Props = HTMLElementProps | TextProps

export type HTMLElementProps = WithChildren<HTMLElement>

export type TextProps = WithChildren<Text>

export type WithChildren<T> = { [P in keyof T]?: T[P] } & { children: ComponentHTMLElement[] }

export const TEXT_ELEMENT = 'TEXT_ELEMENT'

function createElement<P extends Props>(
  type: string,
  props: P,
  ...children: Array<ComponentHTMLElement | string>
): ComponentHTMLElement {
  return {
    type,
    props: {
      ...props,
      children: children.map(child =>
        typeof child === 'object' ? child : createTextElement(child)
      )
    }
  }
}

function createTextElement(text: string): ComponentHTMLElement {
  return {
    type: TEXT_ELEMENT,
    props: {
      nodeValue: text,
      children: []
    }
  }
}

export default {
  createElement
}
