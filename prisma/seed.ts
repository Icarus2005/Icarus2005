import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Team
  const founder = await prisma.teamMember.create({
    data: {
      name: "Piero Saleme",
      email: "pierosaleme@gmail.com",
      role: "SALES_DIRECTOR",
    },
  });

  const exec = await prisma.teamMember.create({
    data: {
      name: "Sara Haddad",
      email: "sara@arqonelabs.com",
      role: "SALES_EXECUTIVE",
    },
  });

  // Accounts
  const emaar = await prisma.account.create({
    data: {
      name: "Emaar Malls",
      industry: "Retail",
      country: "AE",
      sector: "PRIVATE",
      size: "ENTERPRISE",
      locationsCount: 12,
      website: "https://emaarmalls.com",
      description: "Mall operator across Dubai",
      pastEngagements: "Footfall analytics pilot (2025)",
    },
  });

  const stcGroup = await prisma.account.create({
    data: {
      name: "Saudi Tourism Authority",
      industry: "Tourism",
      country: "SA",
      sector: "GOVERNMENT",
      size: "ENTERPRISE",
      description: "National tourism body, KSA",
    },
  });

  // Contacts
  const c1 = await prisma.contact.create({
    data: {
      firstName: "Layla",
      lastName: "Haddad",
      email: "layla@emaarmalls.com",
      title: "Head of Insights",
      role: "CHAMPION",
      linkedin: "https://linkedin.com/in/laylahaddad",
      accountId: emaar.id,
    },
  });

  const c2 = await prisma.contact.create({
    data: {
      firstName: "Fahad",
      lastName: "Al-Qahtani",
      email: "f.qahtani@sta.gov.sa",
      title: "Director of Digital",
      role: "DECISION_MAKER",
      accountId: stcGroup.id,
    },
  });

  // Opportunities
  const opp1 = await prisma.opportunity.create({
    data: {
      name: "PlacePulse Deployment - Dubai Malls",
      stage: "PROPOSAL_SENT",
      type: "PLACEPULSE",
      value: 180000,
      probability: 55,
      markets: "AE",
      decisionMakerEngaged: true,
      expectedCloseDate: new Date("2026-09-30"),
      accountId: emaar.id,
      ownerId: founder.id,
      notes: "PlacePulse rollout across 3 flagship malls. Proposal v2 sent.",
    },
  });

  const opp2 = await prisma.opportunity.create({
    data: {
      name: "Plymio - Tourism Dashboards",
      stage: "DEMO_SCHEDULED",
      type: "PLYMIO",
      value: 95000,
      probability: 40,
      markets: "SA",
      expectedCloseDate: new Date("2026-10-15"),
      accountId: stcGroup.id,
      ownerId: exec.id,
      notes: "Demo scheduled with digital team.",
    },
  });

  await prisma.opportunityContact.createMany({
    data: [
      { opportunityId: opp1.id, contactId: c1.id },
      { opportunityId: opp2.id, contactId: c2.id },
    ],
  });

  // Leads
  await prisma.lead.createMany({
    data: [
      {
        name: "Omar Nasser",
        company: "Alshaya Group",
        title: "VP Retail Tech",
        email: "omar.n@alshaya.com",
        markets: "KW,SA",
        sector: "Retail",
        productInterest: "PLACEPULSE",
        digitalMaturity: "HIGH",
        source: "EVENT",
        tags: "GITEX, priority",
        status: "CONTACTED",
        score: 78,
        ownerId: founder.id,
        notes: "Met at GITEX. Interested in PlacePulse for flagship stores.",
      },
      {
        name: "Sara Aziz",
        company: "Jeddah Season",
        title: "Events Director",
        markets: "SA",
        sector: "Entertainment",
        productInterest: "PLYMIO",
        digitalMaturity: "MEDIUM",
        source: "REFERRAL",
        status: "NEW",
        score: 55,
        ownerId: exec.id,
      },
      {
        name: "Karim Fares",
        company: "Spinneys",
        title: "Head of Operations",
        markets: "AE",
        sector: "F&B",
        productInterest: "ADVISORY",
        digitalMaturity: "LOW",
        source: "OUTBOUND",
        status: "NEW",
        score: 32,
      },
    ],
  });

  // Activities
  await prisma.activity.createMany({
    data: [
      {
        type: "MEETING",
        subject: "Proposal walkthrough with Layla",
        notes: "Positive. Asked for phased pricing.",
        date: new Date("2026-06-20"),
        accountId: emaar.id,
        contactId: c1.id,
        opportunityId: opp1.id,
      },
      {
        type: "EMAIL",
        subject: "Demo agenda sent",
        date: new Date("2026-06-28"),
        accountId: stcGroup.id,
        contactId: c2.id,
        opportunityId: opp2.id,
      },
    ],
  });

  // Tasks
  await prisma.task.createMany({
    data: [
      {
        title: "Send phased pricing option to Emaar",
        dueDate: new Date("2026-07-08"),
        opportunityId: opp1.id,
        accountId: emaar.id,
        ownerId: founder.id,
      },
      {
        title: "Prepare Plymio demo environment",
        dueDate: new Date("2026-07-10"),
        opportunityId: opp2.id,
        accountId: stcGroup.id,
        ownerId: exec.id,
      },
      {
        title: "Follow up with Omar Nasser (Alshaya)",
        dueDate: new Date("2026-07-05"),
        ownerId: founder.id,
      },
    ],
  });

  console.log("ArqOne seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
