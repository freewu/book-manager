declare module 'foliate-js/mobi.js' {
  export class MOBI {
    constructor(opts: {unzlib?: (data: Uint8Array) => Promise<Uint8Array>});
    open(file: Blob): Promise<{
      metadata?: {title?: string};
      sections: Array<{load: () => Promise<string>}>;
      destroy?: () => void;
    }>;
  }
}
