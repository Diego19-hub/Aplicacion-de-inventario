import { Component } from "react";

import { UnexpectedErrorPage } from "../pages/ErrorPages.jsx";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intencionalmente no mostramos detalles internos en pantalla.
  }

  render() {
    if (this.state.hasError) {
      return <UnexpectedErrorPage onReset={() => this.setState({ hasError: false })} />;
    }

    return this.props.children;
  }
}
