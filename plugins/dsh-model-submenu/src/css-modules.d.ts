declare module '*.module.css' {
  export const stylesheet: string
  const classes: Record<string, string>
  export default classes
}