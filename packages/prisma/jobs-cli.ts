#!/usr/bin/env tsx
/**
 * CLI tool for managing background jobs
 *
 * Usage:
 *   npm run jobs:list                    # List all failed jobs
 *   npm run jobs:list -- --status=all    # List all jobs
 *   npm run jobs:list -- --type=seal     # List jobs matching type
 *   npm run jobs:retry <jobId>           # Retry a specific job
 *   npm run jobs:retry-all               # Retry all failed jobs
 *   npm run jobs:retry-all -- --type=seal # Retry failed jobs matching type
 */

import { BackgroundJobStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Command = 'list' | 'retry' | 'retry-all' | 'help';

interface ParsedArgs {
  command: Command;
  jobId?: string;
  status?: 'failed' | 'pending' | 'processing' | 'completed' | 'all';
  type?: string;
  limit?: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    return { command: 'help' };
  }

  const command = args[0] as Command;
  const result: ParsedArgs = { command, limit: 50 };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--status=')) {
      result.status = arg.replace('--status=', '') as ParsedArgs['status'];
    } else if (arg.startsWith('--type=')) {
      result.type = arg.replace('--type=', '');
    } else if (arg.startsWith('--limit=')) {
      result.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if (!arg.startsWith('-')) {
      result.jobId = arg;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Background Jobs CLI

Usage:
  npm run jobs:list [options]           List jobs
  npm run jobs:retry <jobId>            Retry a specific failed job
  npm run jobs:retry-all [options]      Retry all failed jobs

Options:
  --status=<status>   Filter by status (failed, pending, processing, completed, all)
                      Default: failed for list, failed for retry-all
  --type=<type>       Filter by job type (e.g., "seal" matches "internal.seal-document")
  --limit=<n>         Limit number of results (default: 50)

Examples:
  npm run jobs:list                          # List failed jobs
  npm run jobs:list -- --status=all          # List all jobs
  npm run jobs:list -- --type=seal           # List failed jobs with "seal" in name
  npm run jobs:retry cm1234567890            # Retry specific job
  npm run jobs:retry-all                     # Retry all failed jobs
  npm run jobs:retry-all -- --type=seal      # Retry all failed seal-document jobs
`);
}

async function listJobs(args: ParsedArgs): Promise<void> {
  const statusFilter = args.status || 'failed';

  const where: { status?: BackgroundJobStatus; jobId?: { contains: string } } = {};

  if (statusFilter !== 'all') {
    where.status = statusFilter.toUpperCase() as BackgroundJobStatus;
  }

  if (args.type) {
    where.jobId = { contains: args.type };
  }

  const jobs = await prisma.backgroundJob.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    take: args.limit,
    include: {
      tasks: {
        select: {
          id: true,
          name: true,
          status: true,
          retried: true,
        },
      },
    },
  });

  if (jobs.length === 0) {
    console.log(`No jobs found with status: ${statusFilter}`);
    return;
  }

  console.log(`\nFound ${jobs.length} job(s) with status: ${statusFilter}\n`);
  console.log('─'.repeat(120));

  for (const job of jobs) {
    const payloadPreview = job.payload
      ? JSON.stringify(job.payload).substring(0, 60) + '...'
      : 'null';

    console.log(`ID:          ${job.id}`);
    console.log(`Job Type:    ${job.jobId}`);
    console.log(`Name:        ${job.name}`);
    console.log(`Status:      ${job.status}`);
    console.log(`Retried:     ${job.retried}/${job.maxRetries}`);
    console.log(`Submitted:   ${job.submittedAt.toISOString()}`);
    console.log(`Last Retry:  ${job.lastRetriedAt?.toISOString() ?? 'N/A'}`);
    console.log(`Completed:   ${job.completedAt?.toISOString() ?? 'N/A'}`);
    console.log(`Payload:     ${payloadPreview}`);

    if (job.tasks.length > 0) {
      console.log(`Tasks:`);
      for (const task of job.tasks) {
        console.log(`  - ${task.name}: ${task.status} (retried: ${task.retried})`);
      }
    }

    console.log('─'.repeat(120));
  }
}

async function retryJob(jobId: string): Promise<void> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    include: { tasks: true },
  });

  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exit(1);
  }

  if (job.status !== BackgroundJobStatus.FAILED) {
    console.error(`Job is not in FAILED status. Current status: ${job.status}`);
    console.error('Only failed jobs can be retried.');
    process.exit(1);
  }

  console.log(`Retrying job: ${job.id}`);
  console.log(`  Type: ${job.jobId}`);
  console.log(`  Name: ${job.name}`);

  // Reset job status to PENDING and reset retry counters
  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: BackgroundJobStatus.PENDING,
        retried: 0,
        lastRetriedAt: null,
        completedAt: null,
      },
    }),
    // Reset all failed tasks for this job
    prisma.backgroundJobTask.updateMany({
      where: {
        jobId: jobId,
        status: { not: 'COMPLETED' },
      },
      data: {
        status: 'PENDING',
        retried: 0,
      },
    }),
  ]);

  console.log(`\nJob ${jobId} has been reset to PENDING status.`);
  console.log(
    '\nNote: The job will be picked up when the application is running and the job endpoint is triggered.',
  );
  console.log('You may need to manually trigger the job by calling the job API endpoint.');
  console.log(`\nTo trigger via curl (requires app to be running):`);
  console.log(`  The job will need to be resubmitted to: POST /api/jobs/${job.jobId}/${job.id}`);
}

async function retryAllJobs(args: ParsedArgs): Promise<void> {
  const where: { status: BackgroundJobStatus; jobId?: { contains: string } } = {
    status: BackgroundJobStatus.FAILED,
  };

  if (args.type) {
    where.jobId = { contains: args.type };
  }

  const failedJobs = await prisma.backgroundJob.findMany({
    where,
    select: { id: true, jobId: true, name: true },
  });

  if (failedJobs.length === 0) {
    console.log('No failed jobs found to retry.');
    return;
  }

  console.log(`Found ${failedJobs.length} failed job(s) to retry:\n`);

  for (const job of failedJobs) {
    console.log(`  - ${job.id}: ${job.jobId} (${job.name})`);
  }

  console.log('\nResetting jobs to PENDING status...\n');

  const jobIds = failedJobs.map((j) => j.id);

  await prisma.$transaction([
    prisma.backgroundJob.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: BackgroundJobStatus.PENDING,
        retried: 0,
        lastRetriedAt: null,
        completedAt: null,
      },
    }),
    prisma.backgroundJobTask.updateMany({
      where: {
        jobId: { in: jobIds },
        status: { not: 'COMPLETED' },
      },
      data: {
        status: 'PENDING',
        retried: 0,
      },
    }),
  ]);

  console.log(`Successfully reset ${failedJobs.length} job(s) to PENDING status.`);
  console.log('\nNote: Jobs will need to be resubmitted to the job endpoint to be processed.');
}

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    switch (args.command) {
      case 'help':
        printHelp();
        break;
      case 'list':
        await listJobs(args);
        break;
      case 'retry':
        if (!args.jobId) {
          console.error('Error: Job ID is required for retry command');
          console.error('Usage: npm run jobs:retry <jobId>');
          process.exit(1);
        }
        await retryJob(args.jobId);
        break;
      case 'retry-all':
        await retryAllJobs(args);
        break;
      default:
        console.error(`Unknown command: ${args.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
