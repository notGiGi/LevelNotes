import React from "react";
type S = { hasError: boolean; message?: string; stack?: string };
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, S> {
  state: S = { hasError: false };
  static getDerivedStateFromError(err: any): S {
    return { hasError: true, message: String(err) };
  }
  componentDidCatch(error: any, info: any) { console.error("ErrorBoundary", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
          <h1>Something went wrong.</h1>
          <pre style={{ whiteSpace:"pre-wrap", color:"crimson" }}>{this.state.message}</pre>
          <p>Open DevTools (F12) for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
