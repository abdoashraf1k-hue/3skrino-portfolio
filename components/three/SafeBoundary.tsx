"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; onError?: () => void };
type State = { failed: boolean };

/** Swallows render/WebGL errors so a 3D failure never takes the page down. */
export default class SafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
