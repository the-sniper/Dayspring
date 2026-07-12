"use client";

import { Alert } from "@heroui/react";

export default function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert status="danger" className="mb-4">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
