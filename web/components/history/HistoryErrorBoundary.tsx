"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string | null };

/**
 * Catches render/runtime errors in Historiku so a Firestore path bug or bad row
 * does not replace the whole route with a blank error shell.
 */
export class HistoryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("Historiku error", err, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div id="container" className="app-viewport-lock">
          <div id="right-container">
            <div id="dashboard">
              <p role="alert">
                Historiku nuk u ngarkua. Rifresko faqen. Nëse problemi vazhdon,
                kontrollo lejet Firestore për rrugët{" "}
                <code>{`orgs/{orgId}/userAppData/main`}</code> dhe subcollection{" "}
                <code>activityLog</code>.
              </p>
              {this.state.message ? (
                <p className="history-error-hint">
                  {this.state.message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
