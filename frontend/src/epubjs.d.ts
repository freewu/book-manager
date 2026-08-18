declare module 'epubjs' {
  export interface NavItem {
    id: string;
    href: string;
    label: string;
    subitems?: NavItem[];
  }

  export interface Book {
    destroy(): void;
    locations: any;
    navigation?: any;
    getMetadata?(): any;
    loaded: any;
  }

  export interface RenditionLocationStart {
    cfi: string;
    displayed: {page: number; total: number};
    percentage?: number;
  }

  export interface RenditionLocation {
    start: RenditionLocationStart;
    end?: RenditionLocationStart;
    total?: number;
    atStart?: boolean;
    atEnd?: boolean;
  }

  export interface Contents {
    window: Window & {getSelection(): Selection | null};
    document: Document;
  }

  export interface Rendition {
    display(target?: string): Promise<any>;
    next(): void;
    prev(): void;
    destroy(): void;
    themes: {
      fontSize(size: string): void;
      override(key: string, value: string): void;
      register(name: string, styles: Record<string, string>): void;
      select(name: string): void;
    };
    currentLocation(): RenditionLocation | undefined;
    on(event: string, cb: (...args: any[]) => void): void;
    off(event: string, cb: (...args: any[]) => void): void;
  }

  export interface EpubOptions {
    width?: string | number;
    height?: string | number;
    spread?: 'none' | 'auto' | 'always';
    flow?: 'paginated' | 'scrolled-doc' | 'scrolled-continuous';
    allowScriptedContent?: boolean;
  }

  export default function ePub(data: ArrayBuffer | string, options?: any): Book & {
    renderTo(element: HTMLElement, options?: EpubOptions): Rendition;
  };
}
