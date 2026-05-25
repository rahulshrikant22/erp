import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// -- Payment Terms Templates --------------------------------------------------

export interface CreateTemplateInput {
  templateCode: string;
  templateName: string;
  description?: string;
  milestones: Array<{
    milestoneName: string;
    percentage: number;
    triggerEvent: string;
    triggerDays?: number;
    notes?: string;
  }>;
}

export interface UpdateTemplateInput {
  templateName?: string;
  description?: string | null;
  isActive?: boolean;
}

export async function createPaymentTermsTemplate(input: CreateTemplateInput) {
  const existing = await prisma.paymentTermsTemplate.findUnique({ where: { templateCode: input.templateCode } });
  if (existing) throw new ConflictError('Template code already exists');

  const totalPercent = input.milestones.reduce((sum, m) => sum + m.percentage, 0);
  if (Math.abs(totalPercent - 100) > 0.01) {
    throw new ValidationError('Milestone percentages must sum to 100%', { field: 'milestones', total: totalPercent });
  }

  const template = await prisma.paymentTermsTemplate.create({
    data: {
      templateCode: input.templateCode,
      templateName: input.templateName,
      description: input.description,
      milestones: {
        create: input.milestones.map((m, i) => ({
          milestoneSequence: i + 1,
          milestoneName: m.milestoneName,
          percentage: m.percentage,
          triggerEvent: m.triggerEvent,
          triggerDays: m.triggerDays,
          notes: m.notes,
        })),
      },
    },
    include: { milestones: { orderBy: { milestoneSequence: 'asc' } } },
  });

  return { template };
}

export async function listPaymentTermsTemplates() {
  const templates = await prisma.paymentTermsTemplate.findMany({
    include: { milestones: { orderBy: { milestoneSequence: 'asc' } } },
    orderBy: { templateName: 'asc' },
  });
  return { templates };
}

export async function getPaymentTermsTemplate(id: string) {
  const template = await prisma.paymentTermsTemplate.findUnique({
    where: { id },
    include: { milestones: { orderBy: { milestoneSequence: 'asc' } } },
  });
  if (!template) throw new NotFoundError('Template not found');
  return { template };
}

export async function updatePaymentTermsTemplate(id: string, input: UpdateTemplateInput) {
  const existing = await prisma.paymentTermsTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Template not found');

  const template = await prisma.paymentTermsTemplate.update({
    where: { id },
    data: {
      ...(input.templateName !== undefined && { templateName: input.templateName }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: { milestones: { orderBy: { milestoneSequence: 'asc' } } },
  });

  return { template };
}

// -- Order Payment Schedule ---------------------------------------------------

export async function generatePaymentSchedule(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    select: { id: true, paymentTermsTemplateId: true, grandTotal: true, orderDate: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (!order.paymentTermsTemplateId) {
    throw new ValidationError('Order has no payment terms template assigned');
  }

  const template = await prisma.paymentTermsTemplate.findUnique({
    where: { id: order.paymentTermsTemplateId },
    include: { milestones: { orderBy: { milestoneSequence: 'asc' } } },
  });
  if (!template) throw new NotFoundError('Payment terms template not found');

  // Delete existing schedule for regeneration
  await prisma.orderPaymentSchedule.deleteMany({ where: { orderId } });

  const grandTotal = Number(order.grandTotal);
  const schedule = [];

  for (const milestone of template.milestones) {
    const percentage = Number(milestone.percentage);
    const amount = Math.round((grandTotal * percentage / 100) * 100) / 100;

    let dueDate: Date | null = null;
    if (milestone.triggerEvent === 'on_order') {
      dueDate = order.orderDate;
    } else if (milestone.triggerEvent === 'fixed_days' && milestone.triggerDays) {
      dueDate = new Date(order.orderDate);
      dueDate.setDate(dueDate.getDate() + milestone.triggerDays);
    }

    const entry = await prisma.orderPaymentSchedule.create({
      data: {
        orderId,
        milestoneSequence: milestone.milestoneSequence,
        milestoneName: milestone.milestoneName,
        percentage,
        amount,
        triggerEvent: milestone.triggerEvent,
        triggerDays: milestone.triggerDays,
        dueDate,
      },
    });
    schedule.push(entry);
  }

  return { schedule };
}

export async function getPaymentSchedule(orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const schedule = await prisma.orderPaymentSchedule.findMany({
    where: { orderId },
    orderBy: { milestoneSequence: 'asc' },
  });

  return { schedule };
}

export interface UpdateMilestoneInput {
  milestoneName?: string;
  percentage?: number;
  amount?: number;
  triggerEvent?: string;
  triggerDays?: number | null;
  dueDate?: string | null;
  notes?: string | null;
}

export async function updatePaymentMilestone(orderId: string, milestoneId: string, input: UpdateMilestoneInput) {
  const milestone = await prisma.orderPaymentSchedule.findFirst({ where: { id: milestoneId, orderId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  if (milestone.status === 'paid') {
    throw new ConflictError('Cannot modify a fully paid milestone');
  }

  const updated = await prisma.orderPaymentSchedule.update({
    where: { id: milestoneId },
    data: {
      ...(input.milestoneName !== undefined && { milestoneName: input.milestoneName }),
      ...(input.percentage !== undefined && { percentage: input.percentage }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.triggerEvent !== undefined && { triggerEvent: input.triggerEvent }),
      ...(input.triggerDays !== undefined && { triggerDays: input.triggerDays }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  return { milestone: updated };
}

export interface AddMilestoneInput {
  milestoneName: string;
  percentage: number;
  amount: number;
  triggerEvent: string;
  triggerDays?: number;
  dueDate?: string;
  notes?: string;
}

export async function addCustomMilestone(orderId: string, input: AddMilestoneInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const maxSeq = await prisma.orderPaymentSchedule.aggregate({
    where: { orderId },
    _max: { milestoneSequence: true },
  });
  const seq = (maxSeq._max.milestoneSequence ?? 0) + 1;

  const milestone = await prisma.orderPaymentSchedule.create({
    data: {
      orderId,
      milestoneSequence: seq,
      milestoneName: input.milestoneName,
      percentage: input.percentage,
      amount: input.amount,
      triggerEvent: input.triggerEvent,
      triggerDays: input.triggerDays,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes,
    },
  });

  return { milestone };
}

// -- Payment Recording --------------------------------------------------------

export interface RecordPaymentInput {
  milestoneId: string;
  amount: number;
  paymentMode: string;
  reference?: string;
  notes?: string;
}

export async function recordPayment(orderId: string, input: RecordPaymentInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const milestone = await prisma.orderPaymentSchedule.findFirst({ where: { id: input.milestoneId, orderId } });
  if (!milestone) throw new NotFoundError('Payment milestone not found');

  const newPaid = Number(milestone.amountPaid) + input.amount;
  const milestoneAmount = Number(milestone.amount);
  const status = newPaid >= milestoneAmount ? 'paid' : 'partial';

  await prisma.orderPaymentSchedule.update({
    where: { id: input.milestoneId },
    data: {
      amountPaid: newPaid,
      status,
      paidAt: status === 'paid' ? new Date() : null,
      notes: input.notes ?? milestone.notes,
    },
  });

  // Update order-level totals
  const allMilestones = await prisma.orderPaymentSchedule.findMany({ where: { orderId } });
  const totalPaid = allMilestones.reduce((sum, m) => sum + Number(m.amountPaid), 0) + input.amount - Number(milestone.amountPaid);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      amountPaid: Math.round(totalPaid * 100) / 100,
      amountDue: Math.round((Number(order.grandTotal) - totalPaid) * 100) / 100,
    },
  });

  return {
    payment: {
      milestoneId: input.milestoneId,
      amount: input.amount,
      paymentMode: input.paymentMode,
      reference: input.reference,
      milestoneStatus: status,
      totalPaidOnOrder: Math.round(totalPaid * 100) / 100,
    },
  };
}

export async function getPaymentHistory(orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const schedule = await prisma.orderPaymentSchedule.findMany({
    where: { orderId },
    orderBy: { milestoneSequence: 'asc' },
  });

  return {
    grandTotal: Number(order.grandTotal),
    amountPaid: Number(order.amountPaid),
    amountDue: Number(order.amountDue),
    schedule,
  };
}
