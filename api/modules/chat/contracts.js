import { ApiError } from "../../middleware/errors.js"; import { requireObject,requireString } from "../../middleware/validation.js";
export function messageInput(body){return{message:requireString("message",requireObject(body).message,{max:1000})};}
export function messageQuery(query){return{after:queryInt(query.after??"0","after",0,Number.MAX_SAFE_INTEGER),limit:queryInt(query.limit??"50","limit",1,100)};}
export function conversationQuery(query){return{page:queryInt(query.page??"1","page",1,100000),limit:queryInt(query.limit??"20","limit",1,100)};}
function queryInt(v,f,min,max){if(typeof v!=="string"||!/^\d+$/.test(v))invalid(f);const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)invalid(f);return n;} function invalid(field){throw new ApiError(400,"VALIDATION_ERROR","Request validation failed",{fields:{[field]:"Invalid value"}});}
