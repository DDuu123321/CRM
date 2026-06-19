import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Bluven123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@bluven.org.au" },
    update: {},
    create: {
      email: "admin@bluven.org.au",
      name: "Bluven Admin",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log("Admin user ready:", admin.email);

  for (const s of [
    { email: "sam@bluven.org.au", name: "Sam Sales" },
    { email: "riley@bluven.org.au", name: "Riley Rep" },
  ]) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, name: s.name, passwordHash, role: "SALES" },
    });
  }
  console.log("Sales users ready.");

  const existing = await prisma.deal.count();
  if (existing === 0) {
    const jane = await prisma.contact.create({
      data: {
        firstName: "Jane",
        lastName: "Homeowner",
        email: "jane@example.com",
        phone: "0400 000 000",
        sites: {
          create: {
            address: "12 Solar St",
            suburb: "Perth",
            state: "WA",
            postcode: "6000",
          },
        },
      },
      include: { sites: true },
    });
    await prisma.deal.create({
      data: {
        contactId: jane.id,
        siteId: jane.sites[0].id,
        ownerId: admin.id,
        title: "6.6kW solar + battery",
        stage: "NEW",
        source: "WEBSITE_QUOTE",
        activities: {
          create: {
            type: "NOTE",
            body: "Inbound quote request from website.",
            actorId: admin.id,
          },
        },
      },
    });

    const bob = await prisma.contact.create({
      data: {
        firstName: "Bob",
        lastName: "Strata",
        email: "bob@example.com",
        phone: "0411 111 111",
        sites: {
          create: {
            address: "5 Grid Rd",
            suburb: "Melbourne",
            state: "VIC",
            postcode: "3000",
          },
        },
      },
      include: { sites: true },
    });
    await prisma.deal.create({
      data: {
        contactId: bob.id,
        siteId: bob.sites[0].id,
        ownerId: admin.id,
        title: "Battery retrofit",
        stage: "CONTACTED",
        source: "REFERRAL",
      },
    });

    console.log("Seeded 2 contacts + sites + deals.");
  } else {
    console.log(`Deals already present (${existing}), skipping samples.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
