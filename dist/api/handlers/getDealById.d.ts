import type { FastifyRequest, FastifyReply } from 'fastify';
export declare function getDealByIdHandler(request: FastifyRequest<{
    Params: {
        id: string;
    };
}>, reply: FastifyReply): Promise<void>;
