// HTTP endpoint สำหรับอ่าน audit ของผู้บริหาร; SQL อ่าน AuditLog ใน repository.js
import{Router}from"express";import{requireRoles}from"../auth/session.js";import{auditQuery}from"./contracts.js";import{AuditRepository}from"./repository.js";
export function createAuditModule({pool,authenticate}){const repository=new AuditRepository(pool);const router=Router();router.get("/management/audit",authenticate,requireRoles("management","superadmin"),(q,p,n)=>Promise.resolve(repository.list(auditQuery(q.query))).then(data=>p.json(data)).catch(n));return{router};}
