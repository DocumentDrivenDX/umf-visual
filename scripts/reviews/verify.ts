// SPDX-License-Identifier: MIT OR Apache-2.0
import {verifyShowcase} from '../presentation/verify';
import {verifyReviewReceiptBindings,verifyReviewSourceEvidence} from './source-evidence';

export async function verifyReviews(){
 const evidence=await verifyReviewSourceEvidence();
 await verifyReviewReceiptBindings();
 const renders=await verifyShowcase({manifestPath:'fixtures/reviews/review-sources.json',receiptPath:'dist-site/reviews.json',assetDirectory:'reviews'});
 return {...evidence,...renders};
}
if(import.meta.main)console.log(JSON.stringify(await verifyReviews(),null,2));
