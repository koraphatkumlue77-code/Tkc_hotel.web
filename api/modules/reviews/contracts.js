import { ApiError } from "../../middleware/errors.js";
import { requireObject, requireString } from "../../middleware/validation.js";
export function reviewInput(body) { const value=requireObject(body); if(!Number.isInteger(value.rating)||value.rating<1||value.rating>5) invalid("rating"); return {rating:value.rating,content:requireString("content",value.content,{max:2000})}; }
export function hideInput(body) { return {reason:requireString("reason",requireObject(body).reason,{max:500})}; }
export function reviewQuery(query) { return {page:qint(query.page??"1","page",1,100000),limit:qint(query.limit??"20","limit",1,100)}; }
function qint(v,f,min,max){if(typeof v!=="string"||!/^[1-9]\d*$/.test(v))invalid(f);const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)invalid(f);return n;}
function invalid(field){throw new ApiError(400,"VALIDATION_ERROR","Request validation failed",{fields:{[field]:"Invalid value"}});}
