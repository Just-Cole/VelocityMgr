// Type definitions for ansi-to-html 0.x
// Project: https://github.com/rburns/ansi-to-html
// Definitions by: Rogelio Oliver <https://github.com/rogeliog>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'ansi-to-html' {
  interface Colors {
      black: string;
      red: string;
      green: string;
      yellow: string;
      blue: string;
      magenta: string;
      cyan: string;
      white: string;
      gray?: string | undefined;
      grey?: string | undefined;
      brightBlack?: string | undefined;
      brightRed?: string | undefined;
      brightGreen?: string | undefined;
      brightYellow?: string | undefined;
      brightBlue?: string | undefined;
      brightMagenta?: string | undefined;
      brightCyan?: string | undefined;
      brightWhite?: string | undefined;
      [code: number]: string; // Ansi 256 colors
  }

  interface Options {
      /**
       * The default foreground color used when reset color codes are encountered.
       */
      fg?: string | undefined;
      /**
       * The default background color used when reset color codes are encountered.
       */
      bg?: string | undefined;
      /**
       * Convert newline characters to `<br/>`.
       */
      newline?: boolean | undefined;
      /**
       * Escape XML entities.
       */
      escapeXML?: boolean | undefined;
      /**
       * Save style state across invocations of `toHtml()`.
       */
      stream?: boolean | undefined;
      /**
       * Should we output dark-background colors or light-background colors?
       */
      dark?: boolean | undefined;
      /**
       * An object of colors to use.
       */
      colors?: Colors | Partial<Colors> | undefined;
  }

  class Convert {
      constructor(options?: Options);
      /**
       * @param data The text to convert.
       */
      toHtml(data: string): string;
  }

  export = Convert;
}
