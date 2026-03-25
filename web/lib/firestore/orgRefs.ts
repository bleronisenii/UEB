import { collection, doc } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import {
  ACTIVITY_LOG_SUBCOLLECTION,
  ORG_APP_DATA_DOC_ID,
  ORG_APP_DATA_SUBCOLLECTION,
  ORGS_COLLECTION,
} from "@/lib/firestore/collections";

/**
 * Shared org app state document: orgs/{orgId}/userAppData/main
 * Activity log must be a subcollection under this doc (odd segment count).
 */
export function orgMainAppDataDocRef(orgId: string) {
  return doc(
    getFirebaseFirestore(),
    ORGS_COLLECTION,
    orgId,
    ORG_APP_DATA_SUBCOLLECTION,
    ORG_APP_DATA_DOC_ID
  );
}

/** orgs/{orgId}/userAppData/main/activityLog */
export function orgActivityLogCollectionRef(orgId: string) {
  return collection(orgMainAppDataDocRef(orgId), ACTIVITY_LOG_SUBCOLLECTION);
}
