/* eslint-disable */

// ==UserScript==
// @name         SpeedViewRTO
// @namespace    SynView/SpeedViewRTO
// @version      1.2.1
// @description  Create a panel of pre-set buttons to allow automatic case logging. Contains Milestone support.
// @require      https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.3/socket.io.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    window.speedFunc = {};

    //this repairs the default behavior of the time selector function.
    window.speedFunc.AddEventFixed = function()
    {
        disable_foreground("ae_add_event");
        select_deliveryevent();
        /* get the current time */
        //document.add_event_form.ae_time.value = new Date().toLocaleTimeString(navigator.language,{hour:'2-digit',minute:'2-digit'});
    }

    window.speedFunc.RTOButton = function()
    {
        console.log("RTO button pressed");

        let eventCode = document.getElementById("ae_event");
        let children = eventCode.children;

        for(let i = 0; i < children.length; i++)
        {
            if(children[i].value == "Z28")
            {
                children[i].selected = "selected";
            }
        }

        //calculate ETADate
        var today = new Date();
        var etadatebruh;

        if (today.getDay() == 4 || today.getDay() == 5)
        {//thursday & friday
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
        }
        else
        {
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
        }

        document.getElementById("ae_revisedETA_yes").click();

        let eventDate = document.getElementById("ae_etadate");
        let dateValue = `${String(etadatebruh.getFullYear())}-${String(etadatebruh.getMonth() + 1).padStart(2, "0")}-${String(etadatebruh.getDate()).padStart(2, "0")}`;
        eventDate.value = dateValue;
        let formattedDateValue = `${String(etadatebruh.getDate()).padStart(2, "0")}/${String(etadatebruh.getMonth() + 1).padStart(2, "0")}/${String(etadatebruh.getFullYear())}`;
        //console.log(dateValue);

        let eventTime = document.getElementById("ae_time");
        let timeValue = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
        eventTime.valueAsTime = timeValue;


        let id = document.getElementById("order_no").value;
        let name = "John Doe"

        //set sessionStorage token
        let autoCase =
        {
            "media": "PS8",
            "type": "PS8",
            "queryType": "Q021",
            "query": "Z89",
            "message": `DN ${id} Hi All,

                        I will arrange RTO. ETA for RMA ${formattedDateValue}.

                        Regards,
                        ${name}
                         Customer Services`
        }
        sessionStorage.setItem("AutoCase", JSON.stringify(autoCase));
        //we have to set a token because the page reloads after clicking the ok button
        sessionStorage.setItem("casesTab", true);

        //click ok button
        document.getElementById("de_event").click();
        document.getElementById("ae_ok").click();
    }

    window.speedFunc.COAButton = function()
    {
        console.log("COA button pressed");

        let eventCode = document.getElementById("ae_event");
        let children = eventCode.children;

        for(let i = 0; i < children.length; i++)
        {
            if(children[i].value == "Z27")
            {
                children[i].selected = "selected";
            }
        }

        //calculate ETADate
        var today = new Date();
        var etadatebruh;

        if (today.getDay() == 4 || today.getDay() == 5)
        {//thursday
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
        }
        else
        {
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
        }


        document.getElementById("ae_revisedETA_yes").click();

        let eventDate = document.getElementById("ae_etadate");
        let dateValue = `${String(etadatebruh.getFullYear())}-${String(etadatebruh.getMonth() + 1).padStart(2, "0")}-${String(etadatebruh.getDate()).padStart(2, "0")}`;
        eventDate.value = dateValue;
        let formattedDateValue = `${String(etadatebruh.getDate()).padStart(2, "0")}/${String(etadatebruh.getMonth() + 1).padStart(2, "0")}/${String(etadatebruh.getFullYear())}`;
        //console.log(dateValue);

        let eventTime = document.getElementById("ae_time");
        let timeValue = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
        eventTime.valueAsTime = timeValue;


        let id = document.getElementById("order_no").value;
        let name = "John Doe"

        //set sessionStorage token
        let autoCase =
        {
            "media": "PS8",
            "type": "PS8",
            "queryType": "Q008",
            "query": "Z89",
            "message": `DN ${id} Hi All,

                        I have actioned the change of address. ETA for delivery to new address is ${formattedDateValue}.

                        Regards,
                        ${name}
                         Customer Services`
        }
        sessionStorage.setItem("AutoCase", JSON.stringify(autoCase));
        //click cases button
        sessionStorage.setItem("casesTab", true); //we have to set a sessionStorage token because the page reloads.

        document.getElementById("de_event").click();
        document.getElementById("ae_ok").click();

    }

    window.speedFunc.ClaimButton = function()
    {
        console.log("Claim button pressed");

        let eventCode = document.getElementById("ae_event");
        let children = eventCode.children;

        for(let i = 0; i < children.length; i++)
        {
            if(children[i].value == "Z13")
            {
                children[i].selected = "selected";
            }
        }

        //calculate ETADate
        var today = new Date();
        var etadatebruh;

        if (today.getDay() == 4 || today.getDay() == 5)
        {//thursday
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4)
        }
        else
        {
            etadatebruh = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
        }



        let eventDate = document.getElementById("ae_etadate");
        let dateValue = `${String(etadatebruh.getFullYear())}-${String(etadatebruh.getMonth() + 1).padStart(2, "0")}-${String(etadatebruh.getDate()).padStart(2, "0")}`;
        let formattedDateValue = `${String(etadatebruh.getDate()).padStart(2, "0")}/${String(etadatebruh.getMonth() + 1).padStart(2, "0")}/${String(etadatebruh.getFullYear())}`;
        //console.log(dateValue);

        let eventTime = document.getElementById("ae_time");
        let timeValue = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;


        let id = document.getElementById("order_no").value;
        let name = "John Doe"

        //set sessionStorage token
        let autoCase =
        {
            "media": "PS8",
            "type": "PS8",
            "queryType": "Q053",
            "query": "Z89",
            "message": `DN ${id} Hi All,

                        Investigation completed with our delivery partner, please proceed to claim.

                        Regards,
                        ${name}
                         Customer Services`
        }
        sessionStorage.setItem("AutoCase", JSON.stringify(autoCase));
        //click cases button
        sessionStorage.setItem("casesTab", true); //we have to set a sessionStorage token because the page reloads.

        document.getElementById("de_event").click();
        document.getElementById("ae_ok").click();
    }

    window.speedFunc.TestCaseButton = function()
    {
        console.log("Test case button pressed - no event will be logged.");

        let id = document.getElementById("order_no").value;
        let name = "John Doe"

        //set sessionStorage token
        let autoCase =
        {
            "media": "PS8",
            "type": "PS8",
            "queryType": "Q056", //case type
            "query": "Z89", //close with?
            "message": `DN ${id} Hi All,

                       This is a test case. No action was taken.

                        Regards,
                        ${name}
                         Customer Services`
        }

        sessionStorage.setItem("AutoCase", JSON.stringify(autoCase));
        //we have to set a token because the page reloads after clicking the ok button
        sessionStorage.setItem("casesTab", true);
        location.reload();
    }

    window.speedFunc.InvestigationsOngoing = function()
    {
        console.log("Investigations ongoing button pressed - no event will be logged.");

        let id = document.getElementById("order_no").value;
        let name = "John Doe"

        //set sessionStorage token
        let autoCase =
        {
            "media": "PS8",
            "type": "PS8",
            "queryType": "Q056", //case type
            "query": "Z89", //close with?
            "message": `DN ${id} Hi All,

            Investigations are ongoing. We will advise of a further update shortly.

            Regards,
            ${name}
             Customer Services`
        }

        sessionStorage.setItem("AutoCase", JSON.stringify(autoCase));
        //we have to set a token because the page reloads after clicking the ok button
        sessionStorage.setItem("casesTab", true);
        location.reload();
    }

    window.daemon = function()
    {
        console.log("Daemon starting!");
        let socket = io.connect('http://localhost:5432/');
        socket.emit("hello", {"name": "SpeedViewRTODaemon", "version": "0.1.2" });

        socket.on("syn-rto-parcel", () => 
        { 
            socket.emit("client-broadcast", "Logging a test case ya");
            window.speedFunc.TestCaseButton();
        });
        socket.on("syn-rto-claim", () => 
        { 
            socket.emit("client-broadcast", "Claiming for this parcel.");
            window.speedFunc.ClaimButton();
        });
    }

    //register the fix with the right button
    document.getElementById("de_event").onclick = function() { window.speedFunc.AddEventFixed(); };

    let loaded = false;

    //step one: figure out if we have a DN loaded
    if(window.location.href.split("&").length == 1 || window.location.href.split("&")[1].split("=")[1])
    {
        //we are in a loaded SynView
        console.log("Loaded SynView");
        loaded = true;
    }
    else
    {
        //we are in unloaded SynView
        console.log("UNLoaded SynView");
        loaded = false;
        return;
    }

    //step two: add the buttons to the sides

    //buttons to add
    let methodObject = 
    [
        { "name": "RTO Button", "func": window.speedFunc.RTOButton },
        { "name": "COA Button", "func": window.speedFunc.COAButton },
        { "name": "Claim Button", "func": window.speedFunc.ClaimButton },
        { "name": "Investigation Ongoing", "func": window.speedFunc.InvestigationsOngoing },

    ];

    let buttonObject = [];
    let linebreak = document.createElement("br"), cssText = "font-family: Consolas;padding:0.2rem 0.4rem;margin:0.5rem 3rem;border:2px solid #373737;background-color:#171717;color:white;font-size:medium;";

    //populate buttonObject with ready-made DOM objects based on the methods specified above
    for(let i = 0; i < methodObject.length; i++)
    {
        let tempButton = document.createElement("BUTTON");
        tempButton.style.cssText = cssText;
        tempButton.innerHTML = methodObject[i].name;
        tempButton.addEventListener("click", methodObject[i].func);

        buttonObject.push(tempButton);
    }

    //style the transparent div where the buttons will sit
    let divA =  document.createElement("DIV");
    divA.style.right = "0";
    divA.style.top = "0";
    divA.style.position = "absolute";
    divA.style.maxWidth = "15rem";
    divA.style.zIndex = 2;

    //add all the buttons
    for(let i = 0; i < buttonObject.length; i++)
    {
        divA.appendChild(buttonObject[i]);
        divA.appendChild(linebreak);
    }

    //add the div to the side of the screen.
    document.getElementsByTagName("html")[0].appendChild(divA);

    //check if we are instructed to go to the cases tab
    if(sessionStorage.getItem("casesTab"))
    {
        sessionStorage.removeItem("casesTab"); //unset the cases selector
        document.getElementById("cases-tab").click(); //go to cases tab
    }

    // if(loaded) //we want the daemon loaded regardless
        //window.daemon(); //deprecated. we do not want to use this anymore.
})();