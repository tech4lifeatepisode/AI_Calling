import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface TourBookingNotificationProps {
  guestName: string;
  guestEmail: string;
  tourTypeLabel: string;
  scheduledTimeLabel: string;
  timezone: string;
  dealName?: string | null;
  dealUrl?: string | null;
  contactUrl?: string | null;
}

export function TourBookingNotificationEmail(props: TourBookingNotificationProps) {
  const {
    guestName,
    guestEmail,
    tourTypeLabel,
    scheduledTimeLabel,
    timezone,
    dealName,
    dealUrl,
    contactUrl,
  } = props;

  return (
    <Html>
      <Head />
      <Preview>
        {guestName} scheduled a {tourTypeLabel} for {scheduledTimeLabel}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Tour booked via Cara</Heading>
          <Text style={paragraph}>
            A HubSpot deal contact has confirmed a tour through the Retell AI call flow.
          </Text>

          <Section style={card}>
            <Text style={label}>Guest</Text>
            <Text style={value}>{guestName}</Text>
            <Text style={valueMuted}>{guestEmail}</Text>

            <Hr style={hr} />

            <Text style={label}>Tour type</Text>
            <Text style={value}>{tourTypeLabel}</Text>

            <Text style={label}>Scheduled time</Text>
            <Text style={value}>
              {scheduledTimeLabel} ({timezone})
            </Text>

            {dealName ? (
              <>
                <Hr style={hr} />
                <Text style={label}>HubSpot deal</Text>
                <Text style={value}>{dealName}</Text>
              </>
            ) : null}
          </Section>

          {(dealUrl || contactUrl) && (
            <Section style={actions}>
              {dealUrl ? (
                <Button href={dealUrl} style={button}>
                  Open deal in HubSpot
                </Button>
              ) : null}
              {contactUrl ? (
                <Text style={linkRow}>
                  <Link href={contactUrl} style={link}>
                    View contact record
                  </Link>
                </Text>
              ) : null}
            </Section>
          )}

          <Text style={footer}>
            This notification was sent automatically when Cara completed a HubSpot tour booking.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "1.3",
  margin: "0 0 16px",
};

const paragraph = {
  color: "#525f7f",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 24px",
};

const card = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px",
  marginBottom: "24px",
};

const label = {
  color: "#8898aa",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  margin: "0 0 4px",
};

const value = {
  color: "#1a1a1a",
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 12px",
};

const valueMuted = {
  color: "#525f7f",
  fontSize: "14px",
  margin: "0 0 12px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "16px 0",
};

const actions = {
  marginBottom: "24px",
};

const button = {
  backgroundColor: "#ff7a59",
  borderRadius: "6px",
  color: "#fff",
  display: "block",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 20px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const linkRow = {
  margin: "16px 0 0",
  textAlign: "center" as const,
};

const link = {
  color: "#ff7a59",
  fontSize: "14px",
  textDecoration: "underline",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};

export default TourBookingNotificationEmail;
