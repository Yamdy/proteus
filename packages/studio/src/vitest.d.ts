import "@testing-library/jest-dom/vitest";

// Extend Vitest's Assertion interface with jest-dom matchers
declare module "vitest" {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveAttribute(attr: string, value?: string): T;
    toHaveValue(value: string | number | string[]): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeVisible(): T;
    toBeDisabled(): T;
    toHaveClass(...classNames: string[]): T;
    toHaveStyle(style: Record<string, any> | string): T;
    toHaveFocus(): T;
    toContainElement(element: HTMLElement | null): T;
    toContainHTML(html: string): T;
    toHaveFormValues(values: Record<string, any>): T;
  }
}
