import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Load seed data from JSON file
  const seedDataPath = path.join(__dirname, 'seedData.json');
  const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));

  // Seed Manufacturers
  console.log('Seeding manufacturers...');
  for (const manufacturer of seedData.manufacturers) {
    await prisma.manufacturer.upsert({
      where: { id: manufacturer.id },
      update: manufacturer,
      create: manufacturer,
    });
  }

  // Seed Suppliers
  console.log('Seeding suppliers...');
  for (const supplier of seedData.suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: supplier,
      create: supplier,
    });
  }

  // Seed Units
  console.log('Seeding units...');
  for (const unit of seedData.units) {
    await prisma.unit.upsert({
      where: { id: unit.id },
      update: unit,
      create: unit,
    });
  }

  // Seed Categories
  console.log('Seeding categories...');
  for (const category of seedData.categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  // Seed Parts
  console.log('Seeding parts...');
  for (const part of seedData.parts) {
    await prisma.part.upsert({
      where: { partNumber: part.partNumber },
      update: part,
      create: part,
    });
  }

  console.log('Seeding finished.');
  console.log(`Processed ${seedData.manufacturers.length} manufacturers`);
  console.log(`Processed ${seedData.suppliers.length} suppliers`);
  console.log(`Processed ${seedData.units.length} units`);
  console.log(`Processed ${seedData.categories.length} categories`);
  console.log(`Processed ${seedData.parts.length} parts`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
