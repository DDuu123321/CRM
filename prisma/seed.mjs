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

  const existing = await prisma.lead.count();
  if (existing === 0) {
    await prisma.lead.create({
      data: {
        name: "Jane Homeowner",
        email: "jane@example.com",
        phone: "0400 000 000",
        postcode: "6000",
        state: "WA",
        source: "WEBSITE_QUOTE",
        stage: "NEW",
        ownerId: admin.id,
        activities: {
          create: {
            type: "NOTE",
            body: "Inbound quote request from website.",
            actorId: admin.id,
          },
        },
      },
    });
    await prisma.lead.create({
      data: {
        name: "Bob Strata",
        email: "bob@example.com",
        phone: "0411 111 111",
        postcode: "3000",
        state: "VIC",
        source: "REFERRAL",
        stage: "CONTACTED",
        ownerId: admin.id,
      },
    });
    console.log("Seeded 2 sample leads.");
  } else {
    console.log(`Leads already present (${existing}), skipping samples.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
