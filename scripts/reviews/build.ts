// SPDX-License-Identifier: MIT OR Apache-2.0
import {buildShowcase} from '../presentation/build';

export async function buildReviews(){
 return buildShowcase({manifestPath:'fixtures/reviews/review-sources.json',outputPath:'dist-site/reviews.json',assetDirectory:'reviews'});
}
if(import.meta.main){const result=await buildReviews();console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;}
