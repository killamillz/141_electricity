import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import { BRAND } from "../config/email.js";
import { EmailLayout, colors } from "./EmailLayout.js";

interface ResetPasswordEmailProps {
  firstName: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}

const paragraph = { color: colors.text, fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" };

export const ResetPasswordEmail = ({
  firstName,
  resetUrl,
  expiresInMinutes,
}: ResetPasswordEmailProps) => (
  <EmailLayout preview={`Reset your ${BRAND.appName} password`}>
    <Heading as="h1" style={{ color: colors.text, fontSize: "22px", fontWeight: 700, margin: "0 0 24px" }}>
      Reset your password
    </Heading>

    <Text style={paragraph}>Hi {firstName || "there"},</Text>
    <Text style={paragraph}>
      We received a request to reset the password for your {BRAND.appName} account. Click the
      button below to choose a new one.
    </Text>

    <Section style={{ margin: "28px 0", textAlign: "center" }}>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: BRAND.color,
          borderRadius: "8px",
          color: "#FFFFFF",
          display: "inline-block",
          fontSize: "15px",
          fontWeight: 600,
          padding: "14px 28px",
          textDecoration: "none",
        }}
      >
        Reset password
      </Button>
    </Section>

    <Text style={paragraph}>
      This link expires in <strong>{expiresInMinutes} minutes</strong> and can only be used once.
    </Text>

    <Section
      style={{
        backgroundColor: "#F9FAFB",
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "16px",
        margin: "24px 0",
      }}
    >
      <Text style={{ ...paragraph, fontSize: "14px", margin: 0 }}>
        <strong>Didn't request this?</strong> You can safely ignore this email. Your password
        won't change unless you click the link above.
      </Text>
    </Section>

    <Hr style={{ borderColor: colors.border, margin: "24px 0" }} />

    <Text style={{ color: colors.muted, fontSize: "13px", lineHeight: "20px", margin: 0 }}>
      If the button doesn't work, copy and paste this link into your browser:
      <br />
      <Link href={resetUrl} style={{ color: BRAND.color, wordBreak: "break-all" }}>
        {resetUrl}
      </Link>
    </Text>
  </EmailLayout>
);
