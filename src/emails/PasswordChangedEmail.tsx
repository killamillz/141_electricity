import { Button, Heading, Section, Text } from "@react-email/components";
import { BRAND } from "../config/email.js";
import { BILLING_TIMEZONE } from "../utils/month.js";
import { EmailLayout, colors } from "./EmailLayout.js";

interface PasswordChangedEmailProps {
  firstName: string | null;
  email: string;
  changedAt: Date;
  forgotPasswordUrl: string;
}

const paragraph = { color: colors.text, fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" };

const formatWhen = (date: Date) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: BILLING_TIMEZONE,
  }).format(date);

export const PasswordChangedEmail = ({
  firstName,
  email,
  changedAt,
  forgotPasswordUrl,
}: PasswordChangedEmailProps) => (
  <EmailLayout preview={`Your ${BRAND.appName} password was changed`}>
    <Heading as="h1" style={{ color: colors.text, fontSize: "22px", fontWeight: 700, margin: "0 0 24px" }}>
      Your password was changed
    </Heading>

    <Text style={paragraph}>Hi {firstName || "there"},</Text>
    <Text style={paragraph}>
      The password for your {BRAND.appName} account (<strong>{email}</strong>) was changed on{" "}
      {formatWhen(changedAt)} (Lagos time).
    </Text>
    <Text style={paragraph}>If this was you, there's nothing else to do.</Text>

    <Section
      style={{
        backgroundColor: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: "8px",
        padding: "16px",
        margin: "24px 0",
      }}
    >
      <Text style={{ ...paragraph, color: "#991B1B", fontSize: "14px", margin: 0 }}>
        <strong>Didn't change your password?</strong> Someone else may have access to your
        account. Reset your password right away and let our support team know.
      </Text>
    </Section>

    <Section style={{ margin: "28px 0 0", textAlign: "center" }}>
      <Button
        href={forgotPasswordUrl}
        style={{
          backgroundColor: "#FFFFFF",
          border: `1px solid ${BRAND.color}`,
          borderRadius: "8px",
          color: BRAND.color,
          display: "inline-block",
          fontSize: "15px",
          fontWeight: 600,
          padding: "12px 24px",
          textDecoration: "none",
        }}
      >
        Secure my account
      </Button>
    </Section>
  </EmailLayout>
);
