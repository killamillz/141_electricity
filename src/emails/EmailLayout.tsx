import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BRAND } from "../config/email.js";

// Shared frame for every email: brand header, white card, footer.
// Styles are inline because many email apps (Gmail, Outlook) strip <style> tags.

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const colors = {
  text: "#1F2937",
  muted: "#6B7280",
  border: "#E5E7EB",
  page: "#F3F4F6",
  card: "#FFFFFF",
};

interface EmailLayoutProps {
  /** Shown after the subject in the inbox list */
  preview: string;
  children: ReactNode;
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={{ backgroundColor: colors.page, fontFamily: font, margin: 0, padding: "32px 0" }}>
      <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "0 16px" }}>
        <Section
          style={{
            backgroundColor: BRAND.color,
            borderRadius: "12px 12px 0 0",
            padding: "24px 32px",
          }}
        >
          {BRAND.logoUrl ? (
            <Img src={BRAND.logoUrl} alt={BRAND.appName} height="36" style={{ display: "block" }} />
          ) : (
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "0.2px",
                margin: 0,
              }}
            >
              ⚡ {BRAND.appName}
            </Text>
          )}
        </Section>

        <Section
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            padding: "32px",
          }}
        >
          {children}
        </Section>

        <Section style={{ padding: "24px 32px 0", textAlign: "center" }}>
          {BRAND.supportEmail && (
            <Text style={{ color: colors.muted, fontSize: "13px", lineHeight: "20px", margin: "0 0 8px" }}>
              Need help? Contact us at{" "}
              <Link href={`mailto:${BRAND.supportEmail}`} style={{ color: BRAND.color }}>
                {BRAND.supportEmail}
              </Link>
            </Text>
          )}
          <Hr style={{ borderColor: colors.border, margin: "16px 0" }} />
          <Text style={{ color: colors.muted, fontSize: "12px", lineHeight: "18px", margin: 0 }}>
            © {new Date().getFullYear()} {BRAND.appName}. All rights reserved.
            <br />
            This is an automated message about your account; please don't reply to it.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);
