const TRANSITIONS_BY_ROLE = {
  reception: new Set([
    "AVAILABLE>OCCUPIED",
    "OCCUPIED>NEEDS_CLEANING"
  ]),
  housekeeping: new Set([
    "NEEDS_CLEANING>AVAILABLE"
  ]),
  superadmin: new Set([
    "AVAILABLE>OCCUPIED",
    "OCCUPIED>NEEDS_CLEANING",
    "NEEDS_CLEANING>AVAILABLE",
    "AVAILABLE>OUT_OF_SERVICE",
    "OCCUPIED>OUT_OF_SERVICE",
    "NEEDS_CLEANING>OUT_OF_SERVICE",
    "OUT_OF_SERVICE>AVAILABLE"
  ]),
  management: new Set([
    "AVAILABLE>OUT_OF_SERVICE",
    "OCCUPIED>OUT_OF_SERVICE",
    "NEEDS_CLEANING>OUT_OF_SERVICE",
    "OUT_OF_SERVICE>AVAILABLE"
  ])
};

export function isRoomTransitionAllowed(role, fromStatus, toStatus) {
  return TRANSITIONS_BY_ROLE[role]?.has(`${fromStatus}>${toStatus}`) ?? false;
}
