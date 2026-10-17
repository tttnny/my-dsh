declare module '*.css' {
  const content: string;
  export default content;
}

declare module '@deepseek-ai/cordis' {
  export interface Context {
    [key: string]: any;
  }
}
