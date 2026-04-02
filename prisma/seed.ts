import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Accounts
  const acme = await prisma.account.create({
    data: {
      name: "ACME Real Estate",
      industry: "Real Estate",
      country: "UAE",
      sector: "PRIVATE",
      size: "LARGE",
      website: "https://acme-re.ae",
      description: "Leading real estate developer in Dubai",
    },
  });

  const rta = await prisma.account.create({
    data: {
      name: "Roads & Transport Authority",
      industry: "Transportation",
      country: "UAE",
      sector: "GOVERNMENT",
      size: "ENTERPRISE",
      description: "Dubai government transport authority",
    },
  });

  const saudiTel = await prisma.account.create({
    data: {
      name: "Saudi Telecom Co.",
      industry: "Telecommunications",
      country: "SAUDI_ARABIA",
      sector: "SEMI_GOVERNMENT",
      size: "ENTERPRISE",
      website: "https://stc.com.sa",
    },
  });

  // Contacts
  const contact1 = await prisma.contact.create({
    data: {
      firstName: "Ahmed",
      lastName: "Al-Rashidi",
      email: "ahmed@acme-re.ae",
      phone: "+971-50-123-4567",
      title: "Head of Strategy",
      role: "DECISION_MAKER",
      accountId: acme.id,
    },
  });

  const contact2 = await prisma.contact.create({
    data: {
      firstName: "Sara",
      lastName: "Al-Mansouri",
      email: "sara.mansouri@rta.ae",
      phone: "+971-4-234-5678",
      title: "Director of Smart Mobility",
      role: "CHAMPION",
      accountId: rta.id,
    },
  });

  const contact3 = await prisma.contact.create({
    data: {
      firstName: "Khalid",
      lastName: "Al-Otaibi",
      email: "k.otaibi@stc.com.sa",
      phone: "+966-11-500-0000",
      title: "VP Business Development",
      role: "DECISION_MAKER",
      accountId: saudiTel.id,
    },
  });

  // Opportunities
  const opp1 = await prisma.opportunity.create({
    data: {
      name: "Mobility Data Subscription - Dubai",
      stage: "PROPOSAL",
      type: "DATA_PRODUCT",
      value: 120000,
      probability: 60,
      expectedCloseDate: new Date("2026-06-30"),
      accountId: acme.id,
      notes: "Annual subscription for footfall and mobility insights across their 5 properties.",
    },
  });

  const opp2 = await prisma.opportunity.create({
    data: {
      name: "Smart Mobility Consulting",
      stage: "NEGOTIATION",
      type: "CONSULTING",
      value: 350000,
      probability: 75,
      expectedCloseDate: new Date("2026-05-15"),
      accountId: rta.id,
      notes: "3-month engagement to analyse commute patterns and recommend route optimizations.",
    },
  });

  const opp3 = await prisma.opportunity.create({
    data: {
      name: "GCC Telecom Mobility Report",
      stage: "QUALIFIED",
      type: "DATA_PRODUCT",
      value: 85000,
      probability: 40,
      expectedCloseDate: new Date("2026-08-01"),
      accountId: saudiTel.id,
    },
  });

  // Link contacts to opportunities
  await prisma.opportunityContact.createMany({
    data: [
      { opportunityId: opp1.id, contactId: contact1.id },
      { opportunityId: opp2.id, contactId: contact2.id },
      { opportunityId: opp3.id, contactId: contact3.id },
    ],
  });

  // Activities
  await prisma.activity.createMany({
    data: [
      {
        type: "MEETING",
        subject: "Initial discovery call",
        notes: "Discussed data needs around footfall analytics for their retail properties.",
        date: new Date("2026-03-10"),
        accountId: acme.id,
        contactId: contact1.id,
        opportunityId: opp1.id,
      },
      {
        type: "DEMO",
        subject: "Platform demo - mobility dashboard",
        notes: "Showed live GCC mobility data. Very positive response from Sara.",
        date: new Date("2026-03-18"),
        accountId: rta.id,
        contactId: contact2.id,
        opportunityId: opp2.id,
      },
      {
        type: "EMAIL",
        subject: "Sent proposal document",
        notes: "Attached pricing and scope for the consulting engagement.",
        date: new Date("2026-03-25"),
        accountId: rta.id,
        contactId: contact2.id,
        opportunityId: opp2.id,
      },
      {
        type: "CALL",
        subject: "Follow-up with Khalid",
        notes: "He needs internal approval from CFO before moving forward.",
        date: new Date("2026-03-28"),
        accountId: saudiTel.id,
        contactId: contact3.id,
        opportunityId: opp3.id,
      },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
