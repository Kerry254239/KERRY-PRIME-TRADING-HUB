export type EntryDirection =
  | "OVER"
  | "UNDER";


export type EntryPattern = {

  digit:number;

  pattern:number[];

  success:boolean;

};



export type EntryResult = {

  status:string;

  entryDigit:number|null;

  confirmation:number;

  confidence:number;

  candidates:number[];

  patterns:EntryPattern[];

};






function isSuccessfulPattern(
  pattern:number[],
  prediction:number,
  direction:EntryDirection
){


  for(const digit of pattern){


    if(direction==="OVER"){


      if(digit <= prediction){

        return false;

      }


    }



    if(direction==="UNDER"){


      if(digit >= prediction){

        return false;

      }


    }


  }



  return true;


}








export function scanEntryPoint(

digits:number[],

prediction:number,

direction:EntryDirection

):EntryResult {



if(digits.length < 50){


return {


status:"SCANNING ENTRY DIGITS",

entryDigit:null,

confirmation:0,

confidence:0,

candidates:[],

patterns:[]


};


}





const history =
digits.slice(-100);




const candidates:number[]=[];





// Find five strongest entry digits

for(
let i=0;
i<history.length-4;
i++
){



const current =
history[i];



if(current===prediction){

continue;

}





const nextThree =
history.slice(
i+1,
i+4
);





if(
isSuccessfulPattern(
nextThree,
prediction,
direction
)

){



if(!candidates.includes(current)){


candidates.push(current);


}





}





if(candidates.length===5){

break;

}



}








if(candidates.length < 5){


return {


status:"SCANNING ENTRY DIGITS",

entryDigit:null,

confirmation:0,

confidence:0,

candidates,

patterns:[]


};


}






const patterns:EntryPattern[]=[];




let bestDigit:number|null=null;


let bestScore=0;






for(const candidate of candidates){



let successCount=0;


let candidatePatterns:number[][]=[];




for(
let i=0;
i<history.length-4;
i++
){



if(history[i]===candidate){



const next =
history.slice(
i+1,
i+4
);




if(
isSuccessfulPattern(
next,
prediction,
direction
)

){



successCount++;


candidatePatterns.push(next);



}



}



}







patterns.push({


digit:candidate,


pattern:
candidatePatterns[0] || [],


success:
successCount>0


});





if(successCount>bestScore){


bestScore=successCount;


bestDigit=candidate;



}



}








const confirmation =
Math.min(
bestScore,
3
);







return {


status:

confirmation>=3

?

"ENTRY FOUND"

:

"CHOOSING ENTRY",



entryDigit:bestDigit,



confirmation,



confidence:

Math.min(
confirmation/3*100,
100
),



candidates,



patterns



};





}