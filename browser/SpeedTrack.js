/* eslint-disable */

// ==UserScript==
// @name         SpeedTrack
// @namespace    DHL/SpeedTrack
// @version      0.7.8
// @description  Automates generating a list of tracking links, by pretending to be a user repeatedly pressing buttons.
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    window.speedFunc = {};
    const delay = 2500;

    console.log("loaded.");

    window.onload = setTimeout(function()
    {
        document.getElementById("MainContent_txtConsignmentNumber").maxLength = 500000;
        //we want to prep the BigRedButton v2
        let bigRedButton = document.getElementById("MainContent_SubmitCon");
        let b2 = document.createElement("div");//bigRedButton.cloneNode(true);

        b2.id = "StartExport";
        b2.textContent = "Start Export";
        b2.addEventListener('click', window.speedFunc.startExport);
        //b2.style.cssText = window.getComputedStyle(bigRedButton, "").cssText;

        b2.style.backgroundColor = "#00AAAA";
        b2.style.borderColor = "#00AAAA";

        b2.style.width = "15rem";
        b2.classList.add("btn");
        b2.classList.add("btn-primary");
        b2.classList.add("right");
        b2.classList.add("margin-right");
        b2.classList.add("margin-top");

        bigRedButton.parentElement.appendChild(b2);

        //start, running, finished
        var state = sessionStorage.getItem("programState");

        if(!state)
        {
            sessionStorage.setItem("programState", "start");
            sessionStorage.setItem("linkList", "");
        }
        else if(state == "running")
        {
            //getLinkFromResult
            console.log("getLinkFromResult");
            window.speedFunc.getLinkFromResult();
        }

    }, 150);

    window.speedFunc.saveStringToFile = function(contents, filename)
    {
        var dlElement = document.createElement("a");
        dlElement.href = `data:text,${contents}`; //insert contents into the file
        dlElement.download = filename; //filename

        dlElement.click();
    }

    window.speedFunc.startExport = function()
    {
        let textinput = document.getElementById("MainContent_txtConsignmentNumber");

        let packedCNs = textinput.value; // get from primary input

        var unpack = packedCNs.split(" ");
        sessionStorage.setItem("conList", unpack);

        console.log(sessionStorage.getItem("conList").split(","));

        sessionStorage.setItem("programState", "running");
        window.speedFunc.getLinkFromCN(sessionStorage.getItem("conList").split(",")[0]);

    }

    window.speedFunc.getLinkFromCN = function(CN)
    {
        console.log("getting link");
        let textinput = document.getElementById("MainContent_txtConsignmentNumber");
        let bigRedButton = document.getElementById("MainContent_SubmitCon");

        textinput.value = CN;

        bigRedButton.click();
    }

    window.speedFunc.getLinkFromResult = function()
    {
        let resDiv = document.getElementById("MainContent_pnlConResults").children[0];
        let resLink = resDiv.children[2].href;
        let resCon = resDiv.children[1].innerHTML.split(" ")[1];
        let heading = document.getElementsByClassName("container")[1].children[1];

        console.log(resCon);
        console.log(resLink);

        let linkArray = sessionStorage.getItem("linkList").split(",");
        linkArray.push(resCon + "@" + resLink + "\n");
        sessionStorage.setItem("linkList", linkArray);

        let conList = sessionStorage.getItem("conList").split(",");
        conList.shift();
        sessionStorage.setItem("conList", conList);

        heading.innerHTML = `${conList.length} cons left to check.`;

        if(conList.length == 0)
        {
            //program complete
            let LL = sessionStorage.getItem("linkList").split(",");//.shift(); //to get rid of leading empty string

            let LLL = "";
            for(let i = 0; i < LL.length; i++)
            {
                if(i == 0)
                    continue;

                console.log(LL[i]);

                LLL += LL[i];
            }

            LLL = LLL.replaceAll('@', ',');

            //=CONCAT("wget '", B1, "' -OutFile ", A1, ".html")

            window.speedFunc.saveStringToFile(LLL, "texport.csv");
            sessionStorage.clear();
            return;
        }
        else
        {
            setTimeout(() =>
            {
                sessionStorage.setItem("programState", "running");
                console.log(sessionStorage.getItem("conList"));
                window.speedFunc.getLinkFromCN(sessionStorage.getItem("conList").split(",")[0]);
            }, delay);
        }
    }


    console.log(sessionStorage.getItem("programState"));



})();