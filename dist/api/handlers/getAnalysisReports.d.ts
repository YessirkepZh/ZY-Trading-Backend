import type { FastifyRequest, FastifyReply } from 'fastify';
export declare function getAnalysisReportsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function getAnalysisReportByIdHandler(request: FastifyRequest<{
    Params: {
        id: string;
    };
}>, reply: FastifyReply): Promise<void>;
export declare function getLatestAnalysisHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void>;
