// ===============================
// KERRY PRIME ENTRY SCANNER
// ===============================


function createEntryScanner(){


    return {


        status:"WAITING FOR SIGNAL",


        prediction:"WAIT",


        candidates:[],


        entryDigit:null,


        confirmations:0,


        patterns:[],


        testing:false,


        buffer:[]


    };


}






function updateEntryScanner(scanner,prediction,digit){



    scanner.prediction = prediction;



    // STEP 1
    // COLLECT FIRST 5 DIGITS AFTER SIGNAL


    if(scanner.candidates.length < 5){


        scanner.status =
        "SCANNING ENTRY DIGIT";


        scanner.candidates.push(digit);



        if(scanner.candidates.length===5){


            scanner.status =
            "CHOOSING ENTRY";



            chooseEntry(scanner);


        }



        return;


    }






    // STEP 2
    // TEST CONFIRMATIONS


    if(scanner.entryDigit===null){

        return;

    }




    scanner.buffer.push(digit);




    if(scanner.buffer.length===3){



        let valid=true;



        scanner.buffer.forEach(d=>{



            if(prediction==="OVER 2"){


                // reject 0,1,2

                if(d<=2){

                    valid=false;

                }


            }




            if(prediction==="UNDER 7"){


                // reject 7,8,9

                if(d>=7){

                    valid=false;

                }


            }




        });






        if(valid){


            scanner.confirmations++;



            scanner.patterns.push(

                [

                    scanner.entryDigit,

                    ...scanner.buffer

                ]

            );



            scanner.status =

            "CONFIRMING "

            +

            scanner.confirmations

            +

            "/3";



        }

        else{


            scanner.status =
            "INVALID PATTERN - RESCANNING";


            resetEntry(scanner);


        }




        scanner.buffer=[];




        if(scanner.confirmations===3){



            scanner.status =
            "ENTRY FOUND";



        }




    }





}








function chooseEntry(scanner){



    let scores={};




    scanner.candidates.forEach(d=>{


        if(!scores[d]){

            scores[d]=0;

        }





        if(scanner.prediction==="OVER 2"){



            if(d>2){

                scores[d]++;

            }


        }






        if(scanner.prediction==="UNDER 7"){



            if(d<7){

                scores[d]++;

            }


        }




    });






    let best=null;

    let highest=-1;




    Object.keys(scores).forEach(d=>{


        if(scores[d]>highest){


            highest=scores[d];

            best=d;


        }


    });






    if(best!==null){


        scanner.entryDigit =
        Number(best);



        scanner.status =
        "ENTRY SELECTED";


    }

    else{


        resetEntry(scanner);


    }



}









function resetEntry(scanner){



    scanner.candidates=[];

    scanner.entryDigit=null;

    scanner.confirmations=0;

    scanner.patterns=[];

    scanner.buffer=[];

    scanner.status =
    "SCANNING ENTRY DIGIT";



}





module.exports={

createEntryScanner,

updateEntryScanner

};