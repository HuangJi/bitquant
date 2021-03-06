// Copyright (c) 2014, Bitquant Research Laboratories (Asia) Ltd.
// Licensed under the Simplified BSD License

"use strict";
if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(["moment", "./YEARFRAC"], function(moment, YEARFRAC) {
function Calculator() {
}

Calculator.prototype.test_wrapper = function() {
    console.log("Hello world");
};

Calculator.prototype.add_to_event_table = function(func) {
    var o = this;
    return function(param) {
	var on = param["on"];
	if (!(on in o.events)) {
	    if (o.event_list.length > 0 &&
		o.current_event !== undefined &&
		on < o.event_list[o.current_event]) {
		throw new Error("Event already past current=" + o.event_list[o.current_event] + " adding= " +on);
	    }
	    o.event_list.push(on);
	    o.event_list = o.event_list.sort(function(a, b) {
		return new Date(a) - new Date(b);
	    });
	    o.events[on] = [];
	}
	if (param.prepend === "true") {
	    o.events[on].unshift(function() { return func(o, param); });
	} else {
	    o.events[on].push(function() { return func(o, param); });
	}
    };
}

Calculator.prototype.run_events = function(term_sheet) {
    var payment_schedule = [];
    this.currency = term_sheet.currency;
    this.principal = 0.0;
    this.balance = 0.0;
    this.current_event = 0;
    this.late_balance = 0.0;
    this.late_principal = 0.0;
    var obj = this;
    var prev_date = undefined;
    while (this.current_event < this.event_list.length) {
	var k = this.event_list[this.current_event];
        if (prev_date !== undefined &&
	    term_sheet.annual_interest_rate !== undefined &&
	    term_sheet.compound_per_year !== undefined &&
	    term_sheet.day_count_convention !== undefined) {
	    var late_amount, late_interest, amount;
	    var late_annual_interest_rate;
	    var late_compound_per_year;
	    var late_day_count_convention;
	    if (term_sheet.late_annual_interest_rate !== undefined) {
		late_annual_interest_rate =
		    term_sheet.late_annual_interest_rate;
	    } else {
		late_annual_interest_rate =
		    term_sheet.annual_interest_rate;
	    }
	    if (term_sheet.late_compound_per_year !== undefined) {
		late_compound_per_year =
		    term_sheet.late_compound_per_year;
	    } else {
		late_compound_per_year =
		    term_sheet.compound_per_year;
	    }
	    if (term_sheet.late_day_count_convention !== undefined) {
		late_day_count_convention =
		    term_sheet.late_day_count_convention;
	    } else {
		late_day_count_convention =
		    term_sheet.day_count_convention;
	    }

	    
	    if (late_compound_per_year == 0) {
		late_amount = this.late_principal;
		amount = this.principal;
	    } else {
		late_amount = this.late_balance;
		amount = this.balance;
	    }
	    var late_interest = this.capitalization_factor(prev_date,
							k,
							late_annual_interest_rate,
							late_compound_per_year,
							late_day_count_convention) *
		late_amount;
           
            var interest = 
		this.capitalization_factor(prev_date,
					k,
					term_sheet.annual_interest_rate,
					term_sheet.compound_per_year,
					term_sheet.day_count_convention) * 
		(amount - late_amount) + late_interest;
            this.balance = this.balance + interest;
	    this.late_balance = this.late_balance + late_interest;
	}
	var list_counter = 0;
	while (list_counter < this.events[k].length) {
            var payment = this.events[k][list_counter]();
	    list_counter++;
            if (payment === undefined) {
		continue;
	    } else if (payment.constructor === Array) {
		payment.forEach(function(i) {
		    if (payment.late_balance === undefined) {
			payment.late_balance = obj.late_balance;
		    }
		    if (payment.late_principal === undefined) {
			payment.late_principal = obj.late_principal;
		    }
		    payment_schedule.push(payment);
		}
			       );
	    } else {
		if (payment.late_balance === undefined) {
		    payment.late_balance = obj.late_balance;
		}
		if (payment.late_principal === undefined) {
		    payment.late_principal = obj.late_principal;
		}
                payment_schedule.push(payment);
	    }
	    if (payment.failure !== undefined &&
		payment.on !== undefined &&
		payment.deadline !== undefined &&
		payment.on > payment.deadline) {
		payment.failure(payment);
	    }
	    if (payment.success !== undefined &&
		payment.on !== undefined &&
		payment.deadline !== undefined &&
		payment.on <= payment.deadline) {
		payment.success(payment);
	    }
	    if (payment.event == "Terminate") {
		return payment_schedule;
	    }
	}
        prev_date = k;
	this.current_event++;
    }
    return payment_schedule;
}

Calculator.prototype.show_payments = function(term_sheet) {
    var obj = this;
    var payment_schedule = this.calculate(term_sheet);
    var lines = [["type", "payment", "beginning principal",
		"interest", "end_balance"]];
    payment_schedule.forEach (function(i) {
	Array.prototype.push.apply(lines,
				   obj.term_sheet.process_payment(obj, i));
    }
			     );
    return lines;
}

Calculator.prototype.apr = function(payment_schedule) {
    var prev_event = undefined;
    var calc = this;
    var total_interest = 0.0;
    var total_year_frac = 0.0;
    var obj = this;
    payment_schedule.forEach(function(i) {
        if (prev_event != undefined && i['principal'] > 0.0) {
            var year_frac = 
		calc.year_frac(prev_event, i['on'],
			       obj.term_sheet.day_count_convention);
            var interest = i['interest_accrued'] / i['principal'];
            total_year_frac = total_year_frac + year_frac;
            total_interest = total_interest + interest;
	}
        prev_event = i['on'];
    });
    return total_interest / total_year_frac * 100.0;
}

Calculator.prototype.show_payment = function(i) {
    var line = [];
    line.push([i["event"], i["on"], i.payment,
                   i["principal"], i["interest_accrued"],
                    i["balance"]]);
    
    if(i['note'] != undefined) {
        line.push(["  ", i['note']]);
    }
    return line;
}

Calculator.prototype.calculate = function(term_sheet) {
    this.events = {};
    this.event_list = [];
    this.term_sheet = term_sheet;
    term_sheet.payments(this);
    return this.run_events(term_sheet);
}

Calculator.prototype.extract_payment = function(params) {
    var payment;
    if (params == undefined) {
	return undefined;
    }
    if (typeof params == 'number') {
	return params;
    }
    if (params.hasOwnProperty("amount")) {
	payment = params.amount;
    } else {
	payment = params;
    }
    if (typeof(payment) == "function") {
	payment = payment();
    } 
    if (payment == undefined) {
	return undefined;
    }
    if (payment.hasOwnProperty("amount")) {
	payment = payment.amount;
    }
    if (payment.hasOwnProperty("toNumber")) {
	payment = payment.toNumber();
    }
    return payment;
}

Calculator.prototype.action = function(params) {
    var _action = function(o, params) {
	params.action(params);
	return {"event" : "Action",
		"on" : params.on,
		"note" : params.note};
    }
    this.add_to_event_table(_action)(params);
}
    
Calculator.prototype.note = function(params) {
    var _note = function(o, params) {
	return {"event": "Note",
		"on": params.on,
		"note" : params.note};
    }
    this.add_to_event_table(_note)(params);
}

Calculator.prototype.terminate = function(params) {
    var _terminate = function(o, params) {
	return {"event": "Terminate",
		"on": params.on,
		"note" : params.note};
    }
    this.add_to_event_table(_terminate)(params);
}

Calculator.prototype.transfer = function(params) {
    var _transfer = function(o, params) {
	return {"event": "Transfer",
		"on": params.on,
		"actual" : params.actual,
		"from" : params.from,
		"to" : params.to,
		"amount" : o.extract_payment(params),
		"item" : params.item,
		"note" : params.note,
		"success" : params.success,
	        "failure" : params.failure};
    }
    this.add_to_event_table(_transfer)(params);
}

Calculator.prototype.obligation = function(params) {
    var on;
    if (params.actual !== undefined) {
	on = params.actual;
    } else if (params.deadline !== undefined) {
	on = params.deadline;
	params.actual = on;
    } else {
	throw new Error("Obligation requires either deadline or actual");
    }
    params.on = on;

    var _obligation = function(o, params) {
	return {"event": "Obligation",
		"on" : params.on,
		"deadline": params.deadline,
		"actual" : params.actual,
		"from" : params.from,
		"to" : params.to,
		"item" : params.item,
		"note" : params.note,
		"success" : params.success,
	        "failure" : params.failure};
    }
    this.add_to_event_table(_obligation)(params);
}

Calculator.prototype.fund = function(params) {
    var _fund = function(o, params) {
	var payment = o.extract_payment(params);
	var principal = o.principal;
	var interest_accrued = o.balance - o.principal;
	o.balance = o.balance + payment;
	o.principal = o.principal + payment;
        return {"event":"Funding",
                "on":params.on,
                "payment":payment,
                "principal": o.principal,
                "interest_accrued": interest_accrued,
                "balance":o.balance,
                "note":params.note};
    }
    this.add_to_event_table(_fund)(params);
}

var _payment = function(o, params) {
    var payment = o.extract_payment(params);
    var principal = o.principal;
    var interest_accrued = o.balance - o.principal;
    if (payment > o.balance) {
        payment = o.balance;
    }
    if (payment >  (o.balance-o.principal)) {
        o.principal = o.principal - (payment - o.balance + o.principal);
    }
    o.balance = o.balance - payment;
    if (payment > 0) {
        return {"event":"Payment",
                "on":params.on,
                "payment":payment,
                "principal":principal,
                "interest_accrued": interest_accrued,
                "balance":o.balance,
                "note":params.note}
    }
}

Calculator.prototype.payment = function(params) {
    if (params.payment_func === undefined) {
	params.payment_func = _payment;
   }
    this.add_to_event_table(params.payment_func)(params);
}

Calculator.prototype.add_to_balance = function(params) {
    var _payment = function(o, params) {
	var payment = o.extract_payment(params);
        o.balance = o.balance + payment;
        if (payment > 0) {
            return {"event":"Add balance",
                    "on":params.on,
                    "payment":payment,
                    "principal": o.principal,
                    "interest_accrued": 0.0,
                    "balance":o.balance,
                    "note":params.note}
	}
    }
    this.add_to_event_table(_payment)(params);
}

Calculator.prototype.amortize = function(params) {
    if (params.payment_func === undefined) {
	params.payment_func = _payment;
    }
    var _amortize = function(o, params) {
	var p = o.extract_payment(params);
	var remainder = 0.0;
	if (params.remainder != undefined) {
	    remainder = params.remainder;
	    if (typeof(remainder) == "function") {
		remainder = remainder();
	    }
	}
	p = p - remainder;
	var npayments = params.payments;
	var on = params.on;
	var first_payment_date;
	if (params.first_payment_date == undefined) {
	    first_payment_date = o.add_duration(on, params.interval);
	} else {
	    first_payment_date = params.first_payment_date;
	}
	var capitalization_factor = 
	    o.capitalization_factor(on,
				    o.add_duration(on, params.interval),
				    o.term_sheet.annual_interest_rate,
				    o.term_sheet.compound_per_year,
				    o.term_sheet.day_count_convention);
	var payment;
	if (o.term_sheet.compound_per_year === 0) {
	    payment = (1.0 +capitalization_factor) / npayments * p;
	} else {
	    payment = capitalization_factor / 
		(1.0 - Math.pow(1 + capitalization_factor, -npayments)) * p
	}
	var d = first_payment_date;
	var payment_info = {};
	var partial_time = o.year_frac(on, first_payment_date,
					  o.term_sheet.day_count_convention) /
	    o.year_frac(on, o.add_duration(on, params.interval),
			o.term_sheet.day_count_convention);
	payment_info.on = d;
	payment_info.amount = payment * partial_time;
	payment_info.prepend = true;
	payment_info.required = 
	    params.required;
	o.add_to_event_table(params.payment_func)(payment_info);
	d = o.add_duration(d, params.interval);

	for (var i=1; i < npayments; i++) {
	    var payment_info = {};
	    payment_info.on = d;
	    payment_info.amount = payment;
	    payment_info.prepend = true;
	    payment_info.required = 
		params.required;
	    o.add_to_event_table(params.payment_func)(payment_info);
	    d = o.add_duration(d, params.interval);
	}
    }
    this.add_to_event_table(_amortize)(params);
}

Calculator.prototype.set_parameters = function(term_sheet, params) {
    this.set_items(term_sheet, term_sheet.contract_parameters, params);
}

Calculator.prototype.set_events = function(term_sheet, events) {
    this.set_items(term_sheet, term_sheet.event_spec, events);
}

Calculator.prototype.set_items = function(term_sheet, event_spec, events) {
    event_spec.forEach(function(i) {
	if (events[i.name] == undefined &&
	    i.unfilled_value != undefined) {
	    term_sheet[i.name] = i.unfilled_value;
	    return;
	}
	if (events[i.name] == undefined) {
	    return;
	}
	if (i.type == "grid") {
	    var v = events[i.name];
	    term_sheet[i.name] = [];
	    v.forEach(function(row) {
		i.columns.forEach(function (j) {
		    if (row[j.name] === undefined) {
			return;
		    }
		    if (j.type === "date") {
			var vars = row[j.name].split("-");
			row[j.name] =
			    new Date(vars[0], vars[1]-1, vars[2]);
		    } else if (j.name === "amount") {
			row[j.name] = Number(row[j.name]);
		    }
		});
		term_sheet[i.name].push(row);
	    });
	    return;
	} else if (i.type == "date") {
	    var vars = events[i.name].split("-");
	    term_sheet[i.name] =
		new Date(vars[0], vars[1]-1, vars[2]);
	} else if (i.name === "amount" || i.type === "number") {
	    term_sheet[i.name] = Number(events[i.name]);
	} else {
	    term_sheet[i.name] = events[i.name];
	}
    });
}


Calculator.prototype.capitalization_factor = function(from_date,
						       to_date,
						       annual_interest_rate,
						       compound_per_year,
						       day_count_convention) {
    var yearfrac = this.year_frac(from_date, to_date,
				  day_count_convention);
    if (compound_per_year != 0) {
	var periods = yearfrac * compound_per_year;
	return Math.pow((1.0 + annual_interest_rate / 100.0 / 
			 compound_per_year), periods) - 1.0;
    } else {
	return annual_interest_rate / 100.0 * yearfrac;
    }
}

Calculator.prototype.add_duration = function (date,
						  duration) {
    var d = moment(date);
    d.add.apply(d, duration);
    return d.toDate();
}

Calculator.prototype.interest = function(from_date, to_date,
						  amount) {
    var obj = this;
    return function() {
	return obj.capitalization_factor(from_date, 
					 to_date,
					 obj.term_sheet.annual_interest_rate,
					 obj.term_sheet.compound_per_year,
					 obj.term_sheet.day_count_convention) 
	    * amount();
    }
}

Calculator.prototype.year_frac = function(from_date,
					      to_date,
					      day_count_convention) {
    if (day_count_convention === "30/360US") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 0);
    } else if (day_count_convention === "Actual/Actual") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 1);
    } else if (day_count_convention === "Actual/360") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 2);
    } else if (day_count_convention === "Actual/365") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 3);
    } else if (day_count_convention === "30/360EUR") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 4);
    } else if (day_count_convention === "HKMLO") {
	return YEARFRAC.YEARFRAC(from_date, to_date, 0);
    } else {
	throw Error("unknown day count convention");
    }
}

Calculator.prototype.remaining_principal = function() {
    var o = this;
    return function() { return o.principal; }
}

Calculator.prototype.accrued_interest = function() {
    var o = this;
    return function() { return (o.balance - o.principal); }
}

Calculator.prototype.accrued_late_fee = function() {
    var o = this;
    return function() { return (o.late_balance - o.late_principal); }
}

Calculator.prototype.remaining_balance = function() {
    var o = this;
    return function() { return(o.balance); }
}

Calculator.prototype.get_value = function(n) {
    var o = this;
    return function() { return(o[n]); }
}

Calculator.prototype.multiply = function (a, b) {
    var o = this;
    return function() { return o.extract_payment(a) * 
			o.extract_payment(b) };
}

Calculator.prototype.add = function (a, b) {
    var o = this;
    return function() { return o.extract_payment(a) +
			o.extract_payment(b) };
}

Calculator.prototype.limit_balance = function(a, b) {
    var o = this;
    return function() {
	var request = o.extract_payment(a);
	var limit = o.extract_payment(b);
	if (request + o.principal > limit) {
	    return limit - o.principal ;
	} else {
	    return request;
	}
    }
}

return Calculator;
});
